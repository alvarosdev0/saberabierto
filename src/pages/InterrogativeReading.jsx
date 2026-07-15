import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { Button, Heading, Text } from '@ninna-ui/primitives';
import db from '../services/db.js';
import SectionNavigator from '../components/SectionNavigator.jsx';
import Timer from '../components/Timer.jsx';
import QuestionList from '../components/QuestionList.jsx';

/**
 * InterrogativeReading page — single-column: lee el contenido, formula preguntas.
 *
 * Route: /session/:id/section/:sectionId/read
 * Flujo: contenido + preguntas → Continuar a Descarga de Ideas
 */
export default function InterrogativeReading() {
  const { id: sessionId, sectionId } = useParams();
  const navigate = useNavigate();

  // ── Data ─────────────────────────────────────────────────────────────────
  const [sections, setSections] = useState([]);
  const [markdown, setMarkdown] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentSection, setCurrentSection] = useState(null);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [sessionMode, setSessionMode] = useState('');

  // ── Load section data + session mode ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const sess = await db.sessions.get(Number(sessionId));
        if (!sess) { setError('Sesión no encontrada.'); setLoading(false); return; }
        if (!cancelled) setSessionMode(sess.mode || 'manual');

        const allSections = await db.sections.where('sessionId').equals(Number(sessionId)).sortBy('order');
        if (cancelled) return;
        setSections(allSections);

        const sec = allSections.find((s) => String(s.id) === String(sectionId));
        if (!sec) { setError('Sección no encontrada.'); setLoading(false); return; }
        setCurrentSection(sec);

        const note = await db.notes.where('sectionId').equals(Number(sectionId)).first();
        if (cancelled) return;
        setMarkdown(note?.content || note?.text || '');

        const existing = await db.questions.where('sectionId').equals(Number(sectionId)).toArray();
        if (cancelled) return;
        setQuestions(existing);
      } catch (err) {
        if (!cancelled) { console.error('Error loading section:', err); setError('Error al cargar la sección.'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId, sectionId]);

  // ── Question CRUD ────────────────────────────────────────────────────────
  const handleAddQuestion = useCallback(
    async (text) => {
      try {
        const id = await db.questions.add({
          sectionId: Number(sectionId),
          text,
          answered: false,
        });
        const newQuestion = { id, sectionId: Number(sectionId), text, answered: false };
        setQuestions((prev) => [...prev, newQuestion]);
      } catch (err) {
        console.error('Error adding question:', err);
      }
    },
    [sectionId],
  );

  const handleToggleAnswered = useCallback(
    async (id) => {
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          const answered = !q.answered;
          db.questions
            .update(id, { answered, ...(answered ? { answeredAt: new Date() } : {}) })
            .catch(console.warn);
          return { ...q, answered, answeredAt: answered ? new Date() : undefined };
        }),
      );
    },
    [],
  );

  const handleEditQuestion = useCallback(async (id, newText) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, text: newText } : q)));
    try {
      await db.questions.update(id, { text: newText });
    } catch (err) {
      console.warn('Error editing question:', err);
    }
  }, []);

  const handleDeleteQuestion = useCallback(async (id) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    try {
      await db.questions.delete(id);
    } catch (err) {
      console.warn('Error deleting question:', err);
    }
  }, []);

  // ── Timer elapsed → save to sections.duration ────────────────────────────
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

  // ── Simple Markdown-to-HTML renderer ─────────────────────────────────────
  const renderMarkdown = (md) => {
    if (!md) return '<p class="text-base-content/40 italic">Sin contenido</p>';
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-primary mt-3 mb-1">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-primary mt-4 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-primary mt-4 mb-2">$1</h1>')
      .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-base-content">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-base-content">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-2 text-base-content">')
      .replace(/\n/g, '<br>');
    if (!html.startsWith('<h') && !html.startsWith('<li')) {
      html = '<p class="mb-2 text-base-content">' + html + '</p>';
    }
    html = html.replace(/((?:<li class="ml-4 list-disc.*?<\/li>\s*)+)/g, '<ul class="mb-2">$1</ul>');
    html = html.replace(/((?:<li class="ml-4 list-decimal.*?<\/li>\s*)+)/g, '<ol class="mb-2">$1</ol>');
    return html;
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <Text size="sm" className="text-base-content/50">Cargando sección…</Text>
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
    <div className="flex flex-col h-[calc(100dvh-64px)] bg-base-200">
      <h1 className="sr-only">Lectura Interrogativa</h1>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 bg-base-100 border-b border-base-content/10 flex-shrink-0">
        <SectionNavigator sections={sections} currentSectionId={sectionId} mode="read" />
        <Timer onElapsed={handleTimerElapsed} />
      </header>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 border-b border-base-content/10 bg-base-100">
        <Heading as="h1" size="xl" className="font-heading">Lectura Interrogativa</Heading>
        <Text size="xs" className="text-base-content/50 mt-1">
          Lee el contenido y escribe preguntas. Luego continúa a Descarga de Ideas.
        </Text>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Section title */}
        {currentSection && (
          <div className="px-4 pt-4 pb-2">
            <Heading as="h2" size="lg" className="font-heading">{currentSection.title}</Heading>
          </div>
        )}

        {/* Content (collapsible on mobile, shown by default on desktop) */}
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={() => setShowMarkdown(!showMarkdown)}
            className="flex items-center gap-1 text-xs text-base-content/50 mb-2"
          >
            <BookOpen size={14} aria-hidden="true" />
            {showMarkdown ? 'Ocultar contenido' : 'Ver contenido'}
            {showMarkdown ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>

          {showMarkdown && (
            <div className="bg-base-100 rounded-xl border border-base-content/10 p-4 mb-4">
              <div className="prose prose-sm max-w-none font-sans text-base-content leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />
            </div>
          )}
        </div>

        {/* ── Questions section — single list, no tabs ──────────────────── */}
        <div className="px-4 pb-4">
          <div className="bg-base-100 rounded-xl border border-base-content/10 p-3">
            {sessionMode === 'ai' && (
              <Text size="xs" className="text-primary mb-3 flex items-center gap-1">
                Preguntas generadas automáticamente. Puedes editarlas o añadir más.
              </Text>
            )}
            <QuestionList
              questions={questions}
              onAdd={handleAddQuestion}
              onEdit={handleEditQuestion}
              onDelete={handleDeleteQuestion}
            />
          </div>
        </div>
      </div>

      {/* ── Bottom: Continuar a Brain Dump ────────────────────────────────── */}
      <div className="flex-shrink-0 p-3 bg-base-100 border-t border-base-content/10">
        <Button
          color="primary"
          size="lg"
          className="w-full"
          onClick={() => navigate(`/session/${sessionId}/section/${sectionId}/brain-dump`, { replace: true })}
        >
          Continuar a Descarga de Ideas
        </Button>
      </div>
    </div>
  );
}


