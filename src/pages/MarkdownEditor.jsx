import { useState, useCallback, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Button, Heading, Text } from '@ninna-ui/primitives';
import MarkdownEditorComponent from '../components/MarkdownEditor.jsx';
import db from '../services/db.js';
import { splitMarkdownIntoSections, extractSubjectFromMarkdown } from '../lib/split-markdown.js';

/**
 * MarkdownEditor page — post-extraction review + session creation.
 *
 * Route: /session/:id/section/:sectionId/review-md
 *
 * Flow (per design):
 *   1. Receives markdown from route state (passed via navigate after PDF extraction)
 *      or loads from Dexie pdfCache as fallback.
 *   2. Shows the editable MarkdownEditor component with preview toggle.
 *   3. "Aceptar" creates a new study session:
 *      a. Determines subject from PDF filename or first H1 heading
 *      b. Splits markdown by headings into sections
 *      c. Creates session → sections → notes in Dexie
 *      d. Navigates to first section's InterrogativeReading page
 *   4. "Regenerar" returns to the upload page for re-extraction.
 */
export default function MarkdownEditor() {
  const { id: sessionId, sectionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [markdown, setMarkdown] = useState('');
  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const isNewSession = sessionId === 'new';

  // ── Load markdown from route state or Dexie ─────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadMarkdown() {
      setLoading(true);
      setError(null);

      try {
        // Priority 1: Route state (passed from PDFUpload extraction flow)
        if (location.state?.markdown) {
          if (!cancelled) {
            setMarkdown(location.state.markdown);
            setFilename(location.state.filename || 'documento.pdf');
            setLoading(false);
          }
          return;
        }

        // Priority 2: Load from pdfCache (most recent extraction)
        const caches = await db.pdfCache
          .orderBy('createdAt')
          .reverse()
          .limit(1)
          .toArray();

        if (caches.length > 0 && caches[0].text) {
          const { extractedTextToMarkdown } = await import(
            '../lib/markdown-converter.js'
          );
          const md = extractedTextToMarkdown(caches[0].text);

          if (!cancelled) {
            setMarkdown(md);
            setFilename('Extracción reciente');
            setLoading(false);
          }
          return;
        }

        // Priority 3: No content found
        if (!cancelled) {
          setMarkdown('');
          setError(
            'No se encontró contenido para revisar. Sube un PDF primero desde la página de Subir.',
          );
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading markdown:', err);
          setError('Error al cargar el contenido. Inténtalo de nuevo.');
          setLoading(false);
        }
      }
    }

    loadMarkdown();
    return () => { cancelled = true; };
  }, [location.state, sessionId]);

  // ── Accept handler — creates session + sections + notes ──────────────────
  const handleAccept = useCallback(
    async (md) => {
      setCreating(true);
      setError(null);

      try {
        const subject =
          extractSubjectFromMarkdown(md) ||
          filename.replace(/\.(pdf|txt)$/i, '').replace(/[_-]/g, ' ') ||
          'Documento';

        // 1. Deactivate any existing active session + create new one
        const active = await db.sessions
          .where('status')
          .equals('active')
          .toArray();

        await Promise.all(
          active.map((s) =>
            db.sessions.update(s.id, {
              status: 'abandoned',
              updatedAt: new Date(),
            }),
          ),
        );

        const language = location.state?.language || localStorage.getItem('sa:language') || 'es';
        const newSessionId = await db.sessions.add({
          subject,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          sourceFile: filename,
          language,
        });

        // 2. Split markdown into sections
        const sectionEntries = splitMarkdownIntoSections(md);

        // Determine starting order
        const existing = await db.sections
          .where('sessionId')
          .equals(newSessionId)
          .toArray();
        const maxOrder = existing.reduce(
          (max, s) => Math.max(max, s.order || 0),
          0,
        );

        // 3. Bulk-create sections
        const sectionIds = [];
        for (let i = 0; i < sectionEntries.length; i++) {
          const id = await db.sections.add({
            sessionId: newSessionId,
            title: sectionEntries[i].title,
            status: 'pending',
            order: maxOrder + i + 1,
            duration: 0,
          });
          sectionIds.push(id);
        }

        // 4. Create notes for each section (empty — user writes in Brain Dump)
        const now = new Date();
        for (let i = 0; i < sectionEntries.length; i++) {
          await db.notes.add({
            sectionId: sectionIds[i],
            text: '',
            gaps: [],
            hasGaps: false,
            status: 'draft',
            createdAt: now,
          });
        }

        // 5. Clean up any pending markdown settings
        try {
          await db.settings.delete('pending-markdown');
          await db.settings.delete('pending-markdown-meta');
        } catch {
          // ignore — may not exist
        }

        setAccepted(true);

        // 6. Navigate to session setup to choose study mode
        navigate(
          `/session/${newSessionId}/setup`,
          { replace: true },
        );
      } catch (err) {
        console.error('Error creating session:', err);
        setError('Error al crear la sesión de estudio. Inténtalo de nuevo.');
        setCreating(false);
      }
    },
    [navigate, filename],
  );

  // ── Regenerate handler ──────────────────────────────────────────────────
  const handleRegenerate = useCallback(() => {
    navigate('/upload', { replace: true });
  }, [navigate]);

  // ── Markdown change handler ─────────────────────────────────────────────
  const handleChange = useCallback((md) => {
    setMarkdown(md);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <Text size="sm" className="text-base-content/50">Cargando contenido...</Text>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-4">
        <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <Heading as="h2" size="xl">¡Sesión creada!</Heading>
        <Text size="sm" className="text-base-content/70 text-center max-w-md">
          Tu sesión de estudio está lista. Redirigiendo a la primera sección...
        </Text>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <Text size="sm" className="text-base-content/70">Creando sesión de estudio...</Text>
          <Text size="xs" className="text-base-content/40">
            Dividiendo {splitMarkdownIntoSections(markdown).length} secciones
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 max-w-3xl mx-auto">
      {/* Page header */}
      <div>
        <Heading as="h1" size="2xl">Revisar contenido</Heading>
        <Text size="sm" className="text-base-content/70 mt-1">
          Revisa y edita el texto extraído antes de crear tu sesión de estudio.{' '}
          Corrige errores de formato y elimina el contenido irrelevante.
        </Text>
        {filename && (
          <div className="flex items-center gap-2 mt-2 text-sm text-base-content/50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{filename}</span>
          </div>
        )}
      </div>

      {/* Session info — pre-creation summary */}
      {isNewSession && markdown && (
        <div className="px-4 py-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary">
          <Text size="sm" className="font-medium mb-1">Se creará una nueva sesión de estudio</Text>
          <Text size="sm" className="text-primary/80">
            Al confirmar, el texto se dividirá en{' '}
            <strong>{splitMarkdownIntoSections(markdown).length} secciones</strong>{' '}
            usando los encabezados como títulos. Podrás estudiar cada sección con
            preguntas y notas.
          </Text>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger"
        >
          <Text size="sm" className="font-medium mb-1">Error</Text>
          <p>{error}</p>
          <Button
            variant="soft"
            color="danger"
            onClick={() => navigate('/upload')}
            className="mt-3"
          >
            Ir a Subir PDF
          </Button>
        </div>
      )}

      {/* Section info */}
      {sectionId && sectionId !== '0' && (
        <div className="flex items-center gap-2 text-sm text-base-content/50 bg-base-200 px-3 py-2 rounded-lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Sección: {sectionId}</span>
        </div>
      )}

      {/* Markdown editor component */}
      {!error && (
        <MarkdownEditorComponent
          markdown={markdown}
          onChange={handleChange}
          onAccept={handleAccept}
          onRegenerate={handleRegenerate}
        />
      )}
    </div>
  );
}
