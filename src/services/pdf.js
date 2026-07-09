/**
 * PDF processing service — SaberAbierto
 *
 * Wraps pdfjs-dist with lazy loading via dynamic import().
 * The 3 MB pdfjs-dist bundle is only loaded on first PDF upload.
 * Subsequent uploads reuse the cached module.
 *
 * Memory management: after extraction, call cleanup() to free
 * PDF resources and hint the browser GC.
 */

let pdfjsLib = null;

/**
 * Ensure pdfjs-dist is loaded (lazy, cached on first call).
 * @returns {Promise<typeof import('pdfjs-dist')>}
 */
async function ensurePDFJS() {
  if (pdfjsLib) return pdfjsLib;

  pdfjsLib = await import('pdfjs-dist');
  // Worker served locally from /public for offline-first PWA
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  return pdfjsLib;
}

/**
 * Load a PDF file and return the PDFDocumentProxy.
 *
 * @param {File} file - PDF file from <input> or drop event
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export async function loadPDF(file) {
  const lib = await ensurePDFJS();

  const arrayBuffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {ArrayBuffer} */ (reader.result));
    reader.onerror = () => reject(new Error('Error al leer el archivo PDF'));
    reader.readAsArrayBuffer(file);
  });

  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
  return pdf;
}

/**
 * Render a single page to a canvas at a given scale.
 *
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {number} [scale=0.3] - Render scale (~0.3 → ~150 px height for letter)
 * @returns {Promise<string>} Data URL (PNG) of the rendered thumbnail
 */
export async function getThumbnail(page, scale = 0.3) {
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo obtener contexto 2D del canvas');

  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL('image/png');
}

/**
 * Extract text content from specific pages of a loaded PDF.
 *
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdf
 * @param {number[]} pageNumbers - 1-based page numbers to extract
 * @returns {Promise<{ text: string, scannedPages: number[] }>}
 *   text — concatenated text from selected pages
 *   scannedPages — page numbers that had no extractable text (scanned/image-only)
 */
export async function extractTextFromPages(pdf, pageNumbers) {
  const texts = [];
  const scannedPages = [];

  for (const pageNum of pageNumbers) {
    if (pageNum < 1 || pageNum > pdf.numPages) continue;

    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const pageText = content.items
      .map((item) => item.str)
      .join(' ')
      .trim();

    if (!pageText) {
      scannedPages.push(pageNum);
    }

    texts.push(pageText);
  }

  return {
    text: texts.join('\n\n'),
    scannedPages,
  };
}

/**
 * Free PDF document resources and hint the browser GC.
 * Call this after extraction is complete.
 *
 * @param {import('pdfjs-dist').PDFDocumentProxy|null} pdf
 */
export function cleanup(pdf) {
  if (pdf) {
    try {
      pdf.destroy();
    } catch (_) {
      // Best-effort cleanup
    }
  }

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      // GC hint — let the browser reclaim PDF memory (~80-150 MB)
    });
  }
}
