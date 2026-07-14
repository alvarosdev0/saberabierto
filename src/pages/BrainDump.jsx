import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Heading, Text } from '@ninna-ui/primitives';
import db from '../services/db.js';
import SectionNavigator from '../components/SectionNavigator.jsx';

import Timer from '../components/Timer.jsx';
import GapHighlighter from '../components/GapHighlighter.jsx';

/**
 * BrainDump page — free-form note taking with gap flagging.
 *
 * Route: /session/:id/section/:sectionId/brain-dump
 *
 * Features (per design §Component Tree):
 *   - Free-form text area for notes
 *   - Outline marker support (I, II, A, B, i, ii)
 *   - Gap flagging with highlight → persists to notes.gaps
 *   - Auto-save draft with 2-second debounce
 *   - SectionNavigator + ModeSwitch + Timer
 */
export default function BrainDump() {
  const { id: sessionId, sectionId } = useParams();
  const navigate = useNavigate();

  // ── Data ─────────────────────────────────────────────────────────────────
  const [sections, setSections] = useState([]);
  const [text, setText] = useState('');
  const [gaps, setGaps] = useState([]);
  const [noteId, setNoteId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentSection, setCurrentSection] = useState(null);
  const [saved, setSaved] = useState(false);

  // Auto-save debounce
  const saveTimer = useRef(null);
  const textRef = useRef(text);
  const gapsRef = useRef(gaps);
  const textareaRef = useRef(null);

  // Keep refs in sync
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { gapsRef.current = gaps; }, [gaps]);

  // ── Load section data ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Load all sections for this session
        const allSections = await db.sections
          .where('sessionId')
          .equals(Number(sessionId))
          .sortBy('order');
        if (cancelled) return;
        setSections(allSections);

        const sec = allSections.find(
          (s) => String(s.id) === String(sectionId),
        );
        if (!sec) {
          setError('Sección no encontrada.');
          setLoading(false);
          return;
        }
        setCurrentSection(sec);

        // Load existing note
        const note = await db.notes
          .where('sectionId')
          .equals(Number(sectionId))
          .first();

        if (cancelled) return;

        if (note) {
          setNoteId(note.id);
          setText(note.text || '');
          setGaps(note.gaps || []);
        } else {
          // No note yet — create a draft
          const id = await db.notes.add({
            sectionId: Number(sectionId),
            text: '',
            gaps: [],
            hasGaps: false,
            status: 'draft',
            createdAt: new Date(),
          });
          if (cancelled) return;
          setNoteId(id);
          setText('');
          setGaps([]);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading descarga de ideas:', err);
          setError('Error al cargar las notas.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(saveTimer.current);
    };
  }, [sessionId, sectionId]);

  // ── Auto-save with 2 s debounce ──────────────────────────────────────────
  const scheduleSave = useCallback(
    (newText, newGaps) => {
      setSaved(false);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          if (noteId) {
            await db.notes.update(noteId, {
              text: String(newText),
              gaps: newGaps,
              hasGaps: newGaps.length > 0,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }
        } catch (err) {
          console.warn('Auto-save failed:', err);
        }
      }, 2000);
    },
    [noteId],
  );

  const handleTextChange = useCallback(
    (e) => {
      const value = e.target.value;
      setText(value);
      scheduleSave(value, gapsRef.current);
    },
    [scheduleSave],
  );

  // ── Gap management ───────────────────────────────────────────────────────
  const handleGapMark = useCallback(
    (gap) => {
      setGaps((prev) => {
        const updated = [...prev, gap];
        scheduleSave(textRef.current, updated);
        return updated;
      });
    },
    [scheduleSave],
  );

  const handleGapRemove = useCallback(
    (index) => {
      setGaps((prev) => {
        const updated = prev.filter((_, i) => i !== index);
        scheduleSave(textRef.current, updated);
        return updated;
      });
    },
    [scheduleSave],
  );

  // ── Timer → save duration ────────────────────────────────────────────────
  const handleTimerElapsed = useCallback(
    async (seconds) => {
      if (!sectionId) return;
      try {
        await db.sections.update(Number(sectionId), { duration: seconds });
      } catch (err) {
        console.warn('Error saving duration:', err);
      }
    },
    [sectionId],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <Text size="sm" className="text-base-content/50">Cargando notas…</Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div role="alert" className="px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
          <p className="font-medium">Error</p>
          <p>{error}</p>
          <Button
            variant="soft"
            color="danger"
            onClick={() => navigate('/')}
            className="mt-3"
          >
            Volver al inicio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)]">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 bg-base-100 border-b border-base-content/10 flex-shrink-0">
        <SectionNavigator
          sections={sections}
          currentSectionId={sectionId}
          mode="brain-dump"
        />
        <Timer onElapsed={handleTimerElapsed} />
      </header>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 border-b border-base-content/10 bg-base-100">
        <Heading as="h1" size="xl" className="font-heading">Descarga de Ideas</Heading>
        <Text size="xs" className="text-base-content/50 mt-1">
          Escribe con tus propias palabras lo que recuerdas de la lectura. Si hay algo que no dominas bien, márcalo como laguna con el highlight y lo repasarás después.
        </Text>
      </div>

      {/* ── Section title + save indicator ──────────────────────────────── */}
      <div className="px-4 py-2 flex-shrink-0 flex items-center justify-between">
        <Heading as="h2" size="lg" className="font-heading">
          {currentSection?.title || 'Descarga de Ideas'}
        </Heading>
        <span
          aria-live="polite"
          className={`text-xs transition-opacity duration-300 ${
            saved ? 'opacity-100 text-success' : 'opacity-0'
          }`}
        >
          Guardado ✓
        </span>
      </div>

      {/* ── Body: text area + gap highlighter ──────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden px-4 pb-4">
        <div className="flex-1 flex flex-col">
          <GapHighlighter
            textareaRef={textareaRef}
            gaps={gaps}
            onGapMark={handleGapMark}
            onGapRemove={handleGapRemove}
          />

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            className="flex-1 w-full p-4 rounded-lg border border-base-content/10 bg-base-100 font-sans text-sm text-base-content leading-relaxed resize-none focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            style={{ minHeight: '200px' }}
            placeholder={getPlaceholder()}
            aria-label="Área de notas"
          />
        </div>

        {/* Outline marker tips */}
        <details className="mt-3 text-xs text-base-content/40">
          <summary className="cursor-pointer hover:text-base-content/70">
            Marcadores de esquema
          </summary>
          <p className="mt-1 pl-4">
            Usa <code className="bg-base-300 px-1 rounded">I.</code>,{' '}
            <code className="bg-base-300 px-1 rounded">II.</code>,{' '}
            <code className="bg-base-300 px-1 rounded">A.</code>,{' '}
            <code className="bg-base-300 px-1 rounded">B.</code>,{' '}
            <code className="bg-base-300 px-1 rounded">i.</code>,{' '}
            <code className="bg-base-300 px-1 rounded">ii.</code>{' '}
            para estructurar tus notas con un esquema.
          </p>
        </details>
      </div>

      {/* ── Bottom action ──────────────────────────────────────────────── */}
      {(() => {
        const idx = sections.findIndex((s) => String(s.id) === String(sectionId));
        const isLast = idx >= sections.length - 1;

        return (
          <div className="flex-shrink-0 px-4 py-3 bg-base-100 border-t border-base-content/10">
            <Button
              color="primary"
              size="lg"
              className="w-full"
              onClick={async () => {
                try {
                  await db.sections.update(Number(sectionId), { status: 'completed' });
                } catch {}
                if (isLast) {
                  navigate(`/session/${sessionId}/questionnaire`, { replace: true });
                } else {
                  const next = sections[idx + 1];
                  navigate(`/session/${sessionId}/section/${next.id}/read`, { replace: true });
                }
              }}
            >
              {isLast ? 'Ir al cuestionario' : 'Siguiente sección'}
            </Button>
          </div>
        );
      })()}
    </div>
  );
}

/** Rich placeholder encouraging free-form notes. */
function getPlaceholder() {
  return `Escribe todo lo que recuerdes de esta sección…

Consejos:
• No mires el texto — escribe de memoria
• Usa marcadores de esquema: I., II., A., B., i., ii.
• Selecciona texto y márcalo como "laguna" si no lo recuerdas bien
• No te preocupes por el formato — esto es para ti`;
}
