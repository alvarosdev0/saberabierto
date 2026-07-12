import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Key, FlaskConical, Swords, ChevronDown, ChevronUp, Info, BookOpen } from 'lucide-react';
import db from '../services/db.js';
import SectionNavigator from '../components/SectionNavigator.jsx';
import Timer from '../components/Timer.jsx';
import QuestionList from '../components/QuestionList.jsx';

/**
 * InterrogativeReading page — single-column: lee el contenido, formula preguntas.
 *
 * Route: /session/:id/section/:sectionId/read
 * Flujo: contenido + preguntas → Continuar a Brain Dump
 */
export default function InterrogativeReading() {
  const { id: sessionId, sectionId } = useParams();
  const navigate = useNavigate();

  // ── Data ─────────────────────────────────────────────────────────────────
  const [sections, setSections] = useState([]);
  const [markdown, setMarkdown] = useState('');
  const [questions, setQuestions] = useState([]);
  const [activeType, setActiveType] = useState('keyword');
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
        setMarkdown(note?.text || '');

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

  // ── Inline editing ───────────────────────────────────────────────────────
  const startEditing = useCallback((q) => {
    setEditingId(q.id);
    setEditText(q.text);
  }, []);

  const saveEdit = useCallback(async () => {
    if (editingId === null) return;
    const trimmed = editText.trim();
    if (!trimmed) return;

    try {
      await db.questions.update(editingId, { text: trimmed });
      setQuestions((prev) =>
        prev.map((q) => (q.id === editingId ? { ...q, text: trimmed } : q)),
      );
    } catch (err) {
      console.error('Error saving edit:', err);
    }
    setEditingId(null);
    setEditText('');
  }, [editingId, editText]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  // ── Question CRUD ────────────────────────────────────────────────────────
  const handleAddQuestion = useCallback(
    async (text, type) => {
      try {
        const id = await db.questions.add({
          sectionId: Number(sectionId),
          text,
          type,
          answered: false,
        });
        const newQuestion = { id, sectionId: Number(sectionId), text, type, answered: false };
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
    if (!md) return '<p class="text-gray-400 italic">Sin contenido</p>';
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-purple-700 mt-3 mb-1">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-purple-800 mt-4 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-purple-900 mt-4 mb-2">$1</h1>')
      .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-gray-800">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-gray-800">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-2 text-gray-800">')
      .replace(/\n/g, '<br>');
    if (!html.startsWith('<h') && !html.startsWith('<li')) {
      html = '<p class="mb-2 text-gray-800">' + html + '</p>';
    }
    html = html.replace(/((?:<li class="ml-4 list-disc.*?<\/li>\s*)+)/g, '<ul class="mb-2">$1</ul>');
    html = html.replace(/((?:<li class="ml-4 list-decimal.*?<\/li>\s*)+)/g, '<ol class="mb-2">$1</ol>');
    return html;
  };

  // ── Question type tab definitions ────────────────────────────────────────
  const tabs = [
    { key: 'keyword', label: 'Conceptos', icon: Key },
    { key: 'methodological', label: 'Metodología', icon: FlaskConical },
    { key: 'combative', label: 'Combate', icon: Swords },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Cargando sección…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div role="alert" className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <p className="font-medium">Error</p>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-3 px-4 py-2 text-sm font-medium bg-red-100 text-red-800 rounded-md hover:bg-red-200 transition-colors"
            style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] bg-gray-50 dark:bg-[#020617]">
      <h1 className="sr-only">Lectura Interrogativa</h1>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-surface border-b border-gray-200 dark:border-default flex-shrink-0">
        <SectionNavigator sections={sections} currentSectionId={sectionId} mode="read" />
        <Timer onElapsed={handleTimerElapsed} />
      </header>

      {/* ── Explicación ──────────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-purple-50 dark:bg-purple-950 border-b border-purple-100 dark:border-purple-900">
        <div className="flex items-start gap-2 text-xs text-purple-800 dark:text-purple-300 leading-relaxed">
          <Info size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold mb-0.5">Lectura Interrogativa</p>
            <p>Lee el contenido de esta sección. Formula preguntas de los 3 tipos para asegurar que comprendes el material. El esfuerzo de escribir tus propias preguntas mejora la retención a largo plazo. Al terminar, continúa al Brain Dump.</p>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Section title */}
        {currentSection && (
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-lg font-bold text-purple-900 dark:text-purple-300 font-heading">{currentSection.title}</h2>
          </div>
        )}

        {/* Content (collapsible on mobile, shown by default on desktop) */}
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={() => setShowMarkdown(!showMarkdown)}
            className="flex items-center gap-1 text-xs text-gray-500 dark:text-muted mb-2"
          >
            <BookOpen size={14} aria-hidden="true" />
            {showMarkdown ? 'Ocultar contenido' : 'Ver contenido'}
            {showMarkdown ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>

          {showMarkdown && (
            <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default p-4 mb-4">
              <div className="prose prose-sm max-w-none font-sans text-gray-800 dark:text-gray-200 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />
            </div>
          )}
        </div>

        {/* ── Questions section ──────────────────────────────────────────── */}
        <div className="px-4 pb-4">
          <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default overflow-hidden">
            {/* Type tabs */}
            <div className="flex border-b border-gray-200 dark:border-default" role="tablist" aria-label="Tipos de pregunta">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button" role="tab"
                  aria-selected={tab.key === activeType}
                  onClick={() => setActiveType(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-3 text-xs font-medium transition-colors border-b-2 ${
                    tab.key === activeType
                      ? 'border-purple-600 text-purple-700 bg-purple-50 dark:bg-purple-950 dark:text-purple-300'
                      : 'border-transparent text-gray-500 dark:text-muted hover:text-gray-700'
                  }`}
                  style={{ minHeight: '44px' }}
                >
                  <tab.icon size={16} aria-hidden="true" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Question content */}
            <div className="p-3">
              <p className="text-xs text-gray-500 dark:text-muted mb-3">{getTypeDescription(activeType)}</p>

              {sessionMode === 'ai' && (
                <p className="text-xs text-purple-600 dark:text-purple-400 mb-3 flex items-center gap-1">
                  <Info size={12} aria-hidden="true" />
                  Las preguntas se generaron automáticamente en la configuración. Puedes editarlas o añadir más.
                </p>
              )}

              <QuestionList
                questions={questions}
                activeType={activeType}
                onAdd={handleAddQuestion}
                onToggleAnswered={handleToggleAnswered}
                onDelete={handleDeleteQuestion}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom: Continuar a Brain Dump ────────────────────────────────── */}
      <div className="flex-shrink-0 p-3 bg-white dark:bg-surface border-t border-gray-200 dark:border-default">
        <button
          type="button"
          onClick={() => navigate(`/session/${sessionId}/section/${sectionId}/brain-dump`, { replace: true })}
          className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm"
          style={{ minHeight: '44px' }}
        >
          Continuar a Brain Dump
        </button>
      </div>
    </div>
  );
}

/** Descriptive hint for each question type. */
function getTypeDescription(type) {
  switch (type) {
    case 'keyword':
      return 'Captura los términos y conceptos clave como preguntas. ¿Qué significa cada uno?';
    case 'methodological':
      return 'Cuestiona la evidencia y el método. ¿Qué datos respaldan cada afirmación?';
    case 'combative':
      return 'Enfréntate al texto. ¿El autor tiene razón? ¿Qué objeciones encuentras?';
    default:
      return '';
  }
}
