import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Key, FlaskConical, Swords, ChevronDown, ChevronUp,
  Sparkles, Brain, Save, Pencil, Check, X, Loader2,
} from 'lucide-react';
import db from '../services/db.js';
import { createProvider } from '../services/ai/index.js';
import SectionNavigator from '../components/SectionNavigator.jsx';
import ModeSwitch from '../components/ModeSwitch.jsx';
import Timer from '../components/Timer.jsx';
import QuestionList from '../components/QuestionList.jsx';

const LS_PROVIDER_KEY = 'sa:provider';
const lsApiKey = (provider) => `sa:apiKey:${provider}`;

/**
 * InterrogativeReading page — split-pane study with question formulation.
 *
 * Supports two modes (read from session):
 *   - manual: user writes their own questions
 *   - ai: AI-generated questions that can be edited inline
 *
 * The user can toggle between modes freely. Changes are always saved.
 *
 * Route: /session/:id/section/:sectionId/read
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
  const [showMarkdown, setShowMarkdown] = useState(true);

  // ── Mode state ───────────────────────────────────────────────────────────
  const [sessionMode, setSessionMode] = useState('');  // 'manual' | 'ai'
  const [effectiveMode, setEffectiveMode] = useState(''); // current display mode
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [generating, setGenerating] = useState(false);

  // Auto-save debounce ref
  const saveTimer = useRef(null);
  const questionsRef = useRef(questions);

  // Keep ref in sync
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  // ── Load section data + session mode ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Load session mode
        const sess = await db.sessions.get(Number(sessionId));
        if (!sess) {
          setError('Sesión no encontrada.');
          setLoading(false);
          return;
        }
        if (!cancelled) {
          const mode = sess.mode || 'manual';
          setSessionMode(mode);
          setEffectiveMode(mode);
        }

        // Load all sections for this session
        const allSections = await db.sections
          .where('sessionId')
          .equals(Number(sessionId))
          .sortBy('order');
        if (cancelled) return;
        setSections(allSections);

        // Find current section
        const sec = allSections.find(
          (s) => String(s.id) === String(sectionId),
        );
        if (!sec) {
          setError('Sección no encontrada.');
          setLoading(false);
          return;
        }
        setCurrentSection(sec);

        // Load note (markdown content)
        const note = await db.notes
          .where('sectionId')
          .equals(Number(sectionId))
          .first();
        if (cancelled) return;
        setMarkdown(note?.text || '');

        // Load existing questions
        const existing = await db.questions
          .where('sectionId')
          .equals(Number(sectionId))
          .toArray();
        if (cancelled) return;
        setQuestions(existing);
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading section:', err);
          setError('Error al cargar la sección.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId, sectionId]);

  // ── Toggle mode ─────────────────────────────────────────────────────────
  const handleToggleMode = useCallback(async (newMode) => {
    setEffectiveMode(newMode);
    if (newMode === 'ai' && questions.length === 0) {
      // No AI questions yet — generate them
      const providerId = localStorage.getItem(LS_PROVIDER_KEY) || 'deepseek';
      const apiKey = localStorage.getItem(lsApiKey(providerId));
      if (!apiKey) {
        setError('No hay clave API configurada. Ve a Ajustes.');
        return;
      }

      const language = localStorage.getItem('sa:language') || 'es';
      setGenerating(true);

      try {
        const note = await db.notes.where('sectionId').equals(Number(sectionId)).first();
        if (note?.text) {
          const provider = createProvider(providerId, apiKey);
          const result = await provider.generateQuestions(note.text, { count: 5, language });

          if (result.questions && result.questions.length > 0) {
            const newQuestions = [];
            for (const q of result.questions) {
              const id = await db.questions.add({
                sectionId: Number(sectionId),
                text: q.text,
                type: q.type,
                answered: false,
              });
              newQuestions.push({ id, sectionId: Number(sectionId), text: q.text, type: q.type, answered: false });
            }
            setQuestions((prev) => [...prev, ...newQuestions]);
          }
        }
      } catch (err) {
        console.error('Error generating questions:', err);
        setError('Error al generar preguntas. Intenta de nuevo.');
      } finally {
        setGenerating(false);
      }
    }
  }, [sectionId, questions.length]);

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

  // ── Filter questions by type (for display) ──────────────────────────────
  const filteredQuestions = questions.filter((q) => q.type === activeType);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Cargando sección...</p>
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
    <div className="flex flex-col h-[calc(100dvh-64px)]">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-surface border-b border-gray-100 dark:border-default flex-shrink-0">
        <SectionNavigator
          sections={sections}
          currentSectionId={sectionId}
          mode="read"
        />
        <Timer onElapsed={handleTimerElapsed} />
      </header>

      {/* ── Mode switch + IA/Manual toggle ──────────────────────────────── */}
      <div className="px-4 py-2 bg-white dark:bg-surface border-b border-gray-100 dark:border-default flex-shrink-0 flex items-center gap-2">
        <div className="flex-1">
          <ModeSwitch activeMode="read" />
        </div>

        {/* IA / Manual toggle chips */}
        <div className="flex rounded-lg bg-gray-100 dark:bg-muted p-0.5" role="tablist" aria-label="Modo de generación">
          {[
            { key: 'manual', label: '✍️ Manual', icon: Brain },
            { key: 'ai', label: '🤖 IA', icon: Sparkles },
          ].map((opt) => {
            const isActive = effectiveMode === opt.key;
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleToggleMode(opt.key)}
                disabled={generating}
                className={`
                  flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors
                  ${isActive
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground'
                  }
                  ${generating ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                style={{ minHeight: 'var(--touch-target-min)' }}
              >
                <OptIcon size={14} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Generating indicator ────────────────────────────────────────── */}
      {generating && (
        <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 flex items-center gap-2 text-xs text-purple-700">
          <Loader2 size={14} className="animate-spin" />
          Generando preguntas con IA...
        </div>
      )}

      {/* ── Section title ───────────────────────────────────────────────── */}
      {currentSection && (
        <div className="px-4 py-2 flex-shrink-0">
          <h2 className="text-lg font-bold text-purple-900 font-heading">
            {currentSection.title}
          </h2>
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: MarkdownPane (read-only, collapsible) */}
        <div
          className={`
            ${showMarkdown ? 'flex' : 'hidden'}
            md:flex md:w-1/2 flex-col overflow-hidden border-b md:border-b-0 md:border-r border-gray-100 dark:border-default bg-white dark:bg-surface
          `}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 flex-shrink-0">
            <span className="text-xs font-medium text-gray-500">Contenido</span>
            <button
              type="button"
              onClick={() => setShowMarkdown(false)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors md:hidden"
              style={{ minHeight: '44px', minWidth: '44px' }}
              aria-label="Ocultar contenido"
            >
              <ChevronDown size={16} />
              Ocultar
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div
              className="prose prose-sm max-w-none font-sans text-gray-800 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
            />
          </div>
        </div>

        {!showMarkdown && (
          <button
            type="button"
            onClick={() => setShowMarkdown(true)}
            className="flex items-center justify-center gap-1 px-3 py-2 text-xs text-purple-600 bg-purple-50 border-b border-gray-100 md:hidden"
            style={{ minHeight: '44px' }}
          >
            <ChevronUp size={16} />
            Ver contenido
          </button>
        )}

        {/* Right: Questions panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-muted">
          {effectiveMode === 'ai' ? (
            /* ── AI MODE: show generated questions with inline editing ── */
            <>
              {/* Type filter tabs */}
              <div className="flex bg-white dark:bg-surface border-b border-gray-100 dark:border-default flex-shrink-0" role="tablist" aria-label="Tipos de pregunta">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={tab.key === activeType}
                    onClick={() => setActiveType(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-3 text-xs font-medium transition-colors border-b-2 ${
                      tab.key === activeType
                        ? 'border-purple-600 text-purple-700 bg-purple-50'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                    style={{ minHeight: 'var(--touch-target-min)' }}
                  >
                    <tab.icon size={16} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* AI questions list with inline editing */}
              <div className="flex-1 overflow-y-auto p-3">
                {filteredQuestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                    <Sparkles size={32} className="text-gray-300" />
                    <p className="text-sm text-gray-500">
                      No hay preguntas generadas de este tipo.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleToggleMode('ai')}
                      className="px-4 py-2 text-xs font-medium rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                      style={{ minHeight: '44px' }}
                    >
                      Generar con IA
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredQuestions.map((q) => (
                      <div
                        key={q.id}
                        className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-default p-3 flex flex-col gap-2"
                      >
                        {editingId === q.id ? (
                          /* Inline edit mode */
                          <>
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full p-2 text-sm border border-purple-300 rounded-md focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none resize-none"
                              rows={3}
                              style={{ minHeight: '44px' }}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-default text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                style={{ minHeight: '44px' }}
                              >
                                <X size={14} />
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={saveEdit}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                                style={{ minHeight: '44px' }}
                              >
                                <Check size={14} />
                                Guardar
                              </button>
                            </div>
                          </>
                        ) : (
                          /* Display mode */
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-gray-800 dark:text-foreground leading-relaxed flex-1">
                                {q.text}
                              </p>
                              <div className="flex gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => startEditing(q)}
                                  className="p-1.5 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                                  style={{ minHeight: '44px', minWidth: '44px' }}
                                  aria-label="Editar pregunta"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteQuestion(q.id)}
                                  className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  style={{ minHeight: '44px', minWidth: '44px' }}
                                  aria-label="Eliminar pregunta"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                            <span className="text-xs text-gray-400">
                              {q.type === 'keyword' ? '🔑 Concepto' : q.type === 'methodological' ? '🔬 Metodología' : '⚔️ Combate'}
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── MANUAL MODE: show question form ── */
            <>
              {/* Type tabs */}
              <div className="flex bg-white dark:bg-surface border-b border-gray-100 dark:border-default flex-shrink-0" role="tablist" aria-label="Tipos de pregunta">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={tab.key === activeType}
                    onClick={() => setActiveType(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-3 text-xs font-medium transition-colors border-b-2 ${
                      tab.key === activeType
                        ? 'border-purple-600 text-purple-700 bg-purple-50'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                    style={{ minHeight: 'var(--touch-target-min)' }}
                  >
                    <tab.icon size={16} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                <p className="text-xs text-gray-500 dark:text-muted mb-3">{getTypeDescription(activeType)}</p>
                <QuestionList
                  questions={questions}
                  activeType={activeType}
                  onAdd={handleAddQuestion}
                  onToggleAnswered={handleToggleAnswered}
                  onDelete={handleDeleteQuestion}
                />
              </div>
            </>
          )}

          {/* Bottom action */}
          <div className="flex-shrink-0 p-3 bg-white dark:bg-surface border-t border-gray-100 dark:border-default">
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/session/${sessionId}/section/${sectionId}/brain-dump`,
                  { replace: true },
                )
              }
              className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm"
              style={{ minHeight: 'var(--touch-target-min)' }}
            >
              Continuar a Brain Dump
            </button>
          </div>
        </div>
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
