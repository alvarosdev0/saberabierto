import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Languages } from 'lucide-react';
import { Button, Heading, Text } from '@ninna-ui/primitives';
import { Select } from '@ninna-ui/forms';
import FileDropzone from '../components/FileDropzone.jsx';
import ThumbnailGrid from '../components/ThumbnailGrid.jsx';
import ExtractionProgress from '../components/ExtractionProgress.jsx';
import MarkdownEditor from '../components/MarkdownEditor.jsx';
import { loadPDF, getThumbnail, extractTextFromPages, cleanup } from '../services/pdf.js';
import { extractedTextToMarkdown } from '../lib/markdown-converter.js';
import db from '../services/db.js';

/**
 * PDF Upload page — full extraction pipeline.
 *
 * Flow:
 *   1. Drop / pick a PDF → load & generate thumbnails
 *   2. Select pages via grid or range input
 *   3. Click "Extraer texto" → check cache, extract, show progress
 *   4. Review and edit auto-converted Markdown
 *   5. "Aceptar" to confirm, "Regenerar" to restart
 */
export default function PDFUpload() {
  const navigate = useNavigate();

  // --- State machine ---
  const [stage, setStage] = useState('idle'); // idle | loaded | extracting | review
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pages, setPages] = useState([]);
  const [selectedPages, setSelectedPages] = useState(/** @type {Set<number>} */ (new Set()));
  const [rangeInput, setRangeInput] = useState('');
  const [rangeError, setRangeError] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, stage: 'loading' });
  const [markdown, setMarkdown] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [scannedPages, setScannedPages] = useState([]);
  const [extractionFile, setExtractionFile] = useState(null);
  const [contentHash, setContentHash] = useState(null);
  const [language, setLanguage] = useState(() => localStorage.getItem('sa:language') || 'es');
  const [jumpToPage, setJumpToPage] = useState(0);

  // Reset jumpToPage after it's been consumed by ThumbnailGrid
  useEffect(() => {
    if (jumpToPage > 0) setJumpToPage(0);
  }, [jumpToPage]);

  // Track rendered thumbnails to avoid re-rendering
  const renderedRef = useRef(/** @type {Set<number>} */ (new Set()));

  // --- Step 1: File selected → load PDF ---
  const handleFileSelected = useCallback(async (file) => {
    // Clean up previous PDF if any
    if (pdfDoc) {
      cleanup(pdfDoc);
      setPdfDoc(null);
    }

    setStage('loaded');
    setSelectedPages(new Set());
    setRangeInput('');
    setRangeError(null);
    setMarkdown('');
    setScannedPages([]);
    setExtractionFile(file);

    // Compute content hash for cache lookup
    const hash = await computeContentHash(file);
    setContentHash(hash);

    try {
      const pdf = await loadPDF(file);
      setPdfDoc(pdf);

      // Initialize page entries (no URLs yet — rendered lazily)
      const initialPages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        initialPages.push({ pageNumber: i, url: null });
      }
      setPages(initialPages);

      // Eagerly render first 10 thumbnails for immediate visibility
      const eagerCount = Math.min(10, pdf.numPages);
      for (let i = 1; i <= eagerCount; i++) {
        const page = await pdf.getPage(i);
        const url = await getThumbnail(page, 0.3);
        initialPages[i - 1].url = url;
        renderedRef.current.add(i);
      }
      setPages([...initialPages]); // trigger re-render with URLs
    } catch (err) {
      console.error('Error loading PDF:', err);
      setStage('idle');
    }
  }, [pdfDoc]);

  // --- Lazy thumbnail render (called when ThumbnailGrid needs a page) ---
  const handleNeedRender = useCallback(async (pageNumber) => {
    if (!pdfDoc) return;
    if (renderedRef.current.has(pageNumber)) return;

    renderedRef.current.add(pageNumber);

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const url = await getThumbnail(page, 0.3);

      setPages((prev) => {
        const updated = [...prev];
        if (updated[pageNumber - 1]) {
          updated[pageNumber - 1] = { ...updated[pageNumber - 1], url };
        }
        return updated;
      });
    } catch (err) {
      console.error(`Error rendering thumbnail for page ${pageNumber}:`, err);
    }
  }, [pdfDoc]);

  // --- Step 2: Page selection handlers ---
  const handleTogglePage = useCallback((pageNumber) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) {
        next.delete(pageNumber);
      } else {
        next.add(pageNumber);
      }
      return next;
    });
    // Auto-jump when tapping a page beyond visible range
    setJumpToPage(pageNumber);
  }, []);

  const handleSelectRange = useCallback((start, end) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) {
        next.add(i);
      }
      return next;
    });
    // Auto-jump to make the end of the range visible
    setJumpToPage(end);
  }, []);

  const handleRangeInputApply = () => {
    setRangeError(null);
    const trimmed = rangeInput.trim();
    if (!trimmed) return;

    // Parse "23-45" format
    const match = trimmed.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (!match) {
      setRangeError('Formato: "23-45" (número inicial - número final)');
      return;
    }

    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);

    if (start < 1 || end > pages.length || start > end) {
      setRangeError(`Páginas deben estar entre 1 y ${pages.length}`);
      return;
    }

    handleSelectRange(start, end);
  };

  // --- Step 3: Extract text ---
  const handleExtract = useCallback(async () => {
    if (!pdfDoc || selectedPages.size === 0) return;

    const pageNumbers = Array.from(selectedPages).sort((a, b) => a - b);
    const rangeKey = formatPageRange(pageNumbers);
    const totalPages = pageNumbers.length;

    setStage('extracting');
    setProgress({ current: 0, total: totalPages, stage: 'extracting' });

    try {
      // Check Dexie cache first
      if (contentHash) {
        const cached = await db.pdfCache
          .where('[contentHash+pageRange]')
          .equals([contentHash, rangeKey])
          .first();

        if (cached && cached.text && cached.pageCount === pdfDoc.numPages) {
          // Cache hit — skip extraction
          const md = extractedTextToMarkdown(cached.text);
          setMarkdown(md);
          setWordCount(cached.text.trim().split(/\s+/).length);
          setScannedPages([]);
          setProgress({ current: totalPages, total: totalPages, stage: 'done' });

          // Free PDF memory
          cleanup(pdfDoc);
          setPdfDoc(null);

          setTimeout(() => setStage('review'), 500);
          return;
        }
      }

      // Cache miss — extract text
      const { text, scannedPages: scanned } = await extractTextFromPages(
        pdfDoc,
        pageNumbers,
      );
      setScannedPages(scanned);

      // Store in cache
      if (contentHash && text) {
        try {
          await db.pdfCache.put({
            contentHash,
            pageRange: rangeKey,
            text,
            pageCount: pdfDoc.numPages,
            createdAt: new Date(),
          });
        } catch (cacheErr) {
          console.warn('Failed to cache extraction:', cacheErr);
        }
      }

      // Convert to Markdown
      const md = extractedTextToMarkdown(text);
      setMarkdown(md);
      setWordCount(text.trim().split(/\s+/).length);

      // Update progress to done
      setProgress({ current: totalPages, total: totalPages, stage: 'done' });

      // Free PDF memory
      cleanup(pdfDoc);
      setPdfDoc(null);

      // Transition to review after a brief delay
      setTimeout(() => setStage('review'), 500);
    } catch (err) {
      console.error('Extraction error:', err);
      setStage('loaded');
    }
  }, [pdfDoc, selectedPages, contentHash, pages.length]);

  // --- Step 4: Accept / Regenerate ---
  const handleAccept = useCallback((md) => {
    // Navigate to MarkdownEditor page for session creation
    navigate('/session/new/section/0/review-md', {
      state: {
        markdown: md,
        filename: extractionFile?.name || 'documento.pdf',
        language,
      },
      replace: true,
    });
  }, [navigate, extractionFile, language]);

  const handleRegenerate = useCallback(() => {
    // Clean up and go back to idle
    if (pdfDoc) {
      cleanup(pdfDoc);
      setPdfDoc(null);
    }
    setStage('idle');
    setPages([]);
    setSelectedPages(new Set());
    setMarkdown('');
    setScannedPages([]);
    setExtractionFile(null);
    setContentHash(null);
    renderedRef.current.clear();
  }, [pdfDoc]);

  const handleLanguageChange = useCallback((e) => {
    const lang = e.target.value;
    setLanguage(lang);
    localStorage.setItem('sa:language', lang);
  }, []);

  // --- Render ---
  return (
    <div className="flex flex-col gap-6 p-4 max-w-3xl mx-auto">
      {/* Page header */}
      <div>
        <Heading as="h1" size="2xl">Subir PDF</Heading>
        <Text size="sm" className="text-base-content/70 mt-1">
          Selecciona un archivo PDF y elige las páginas que quieres estudiar
        </Text>
      </div>

      {/* Language selector — always visible */}
      <div className="flex items-center gap-2">
        <Languages size={18} className="text-base-content/40" />
        <select
          value={language}
          onChange={handleLanguageChange}
          className="flex-1 px-3 py-2 text-sm border border-base-content/10 rounded-lg bg-base-100 text-base-content focus:border-primary outline-none"
          aria-label="Idioma de las preguntas"
        >
          <option value="es">Español — preguntas en español</option>
          <option value="en">English — questions in English</option>
        </select>
      </div>

      {/* FileDropzone — always visible in idle/loaded/extracting */}
      {(stage === 'idle' || stage === 'loaded' || stage === 'extracting') && (
        <FileDropzone onFileSelected={handleFileSelected} />
      )}

      {/* Stage: loaded — show thumbnails + page selection */}
      {stage === 'loaded' && pages.length > 0 && (
        <>
          {/* Range input */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => {
                  setRangeInput(e.target.value);
                  setRangeError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRangeInputApply();
                }}
                placeholder='Rango de páginas, ej. "23-45"'
                className="flex-1 px-3 py-2 border border-base-300 rounded-md text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                style={{ minHeight: '44px' }}
                aria-label="Rango de páginas"
              />
              <Button
                variant="soft"
                color="primary"
                onClick={handleRangeInputApply}
              >
                Aplicar
              </Button>
            </div>
            {rangeError && (
              <Text size="xs" className="text-danger">{rangeError}</Text>
            )}
          </div>

          {/* Thumbnail grid */}
          <ThumbnailGrid
            pages={pages}
            selectedPages={selectedPages}
            onTogglePage={handleTogglePage}
            onSelectRange={handleSelectRange}
            onNeedRender={handleNeedRender}
            jumpToPage={jumpToPage}
          />

          {/* Extract button */}
          <Button
            color="primary"
            size="lg"
            onClick={handleExtract}
            disabled={selectedPages.size === 0}
            className="w-full"
          >
            Extraer texto{' '}
            {selectedPages.size > 0 && `(${selectedPages.size} páginas)`}
          </Button>
        </>
      )}

      {/* Stage: extracting — show progress */}
      {stage === 'extracting' && (
        <ExtractionProgress
          progress={progress}
          wordCount={progress.stage === 'done' ? wordCount : undefined}
        />
      )}

      {/* Stage: review — show Markdown editor */}
      {stage === 'review' && (
        <>
          {/* Scanned page warnings */}
          {scannedPages.length > 0 && (
            <div
              role="alert"
              className="px-4 py-3 bg-warning/10 border border-warning/30 rounded-lg text-sm text-warning"
            >
              <p className="font-medium mb-1">Páginas sin texto extraíble:</p>
              <p>
                {scannedPages.map((n) => `La página ${n} no contiene texto extraíble`).join('. ')}
                .
              </p>
              <Text size="xs" className="text-warning/70 mt-1">
                Estas páginas parecen ser imágenes escaneadas. No se pudo extraer texto de ellas.
              </Text>
            </div>
          )}

          {/* Extracted file info */}
          {extractionFile && (
            <div className="flex items-center gap-2 text-sm text-base-content/50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>{extractionFile.name}</span>
              <span>·</span>
              <span>{wordCount.toLocaleString()} palabras</span>
            </div>
          )}

          {/* Markdown editor */}
          <MarkdownEditor
            markdown={markdown}
            onChange={setMarkdown}
            onAccept={handleAccept}
            onRegenerate={handleRegenerate}
          />
        </>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 content hash of a file for cache lookups.
 *
 * @param {File} file
 * @returns {Promise<string>} Hex-encoded hash
 */
async function computeContentHash(file) {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback: file name + size + lastModified
    return `fallback:${file.name}:${file.size}:${file.lastModified}`;
  }
}

/**
 * Format a sorted array of page numbers into a compact range string.
 *
 * Examples:
 *   [1,2,3] → "1-3"
 *   [1,2,3,5,7,8] → "1-3,5,7-8"
 *
 * @param {number[]} pageNumbers - Sorted array of page numbers
 * @returns {string}
 */
function formatPageRange(pageNumbers) {
  if (pageNumbers.length === 0) return '';

  const ranges = [];
  let start = pageNumbers[0];
  let end = start;

  for (let i = 1; i < pageNumbers.length; i++) {
    if (pageNumbers[i] === end + 1) {
      end = pageNumbers[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = pageNumbers[i];
      end = start;
    }
  }
  // Push the last range
  ranges.push(start === end ? `${start}` : `${start}-${end}`);

  return ranges.join(',');
}
