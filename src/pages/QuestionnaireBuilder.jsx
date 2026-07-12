import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, Bot, PenSquare, Check } from 'lucide-react';
import db from '../services/db.js';

/**
 * QuestionnaireBuilder — importa las preguntas de la lectura al cuestionario.
 *
 * Route: /session/:id/questionnaire
 * Flujo: selecciona preguntas de lectura → se guardan como items → repaso
 */
export default function QuestionnaireBuilder() {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();

  const [sections, setSections] = useState([]);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Reading tab state
  const [readingQuestions, setReadingQuestions] = useState([]);
  const [readingSelected, setReadingSelected] = useState(new Set());
  const [readingLoading, setReadingLoading] = useState(false);

  const [saveStatus, setSaveStatus] = useState(null);

  // ── Load session data ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const allSections = await db.sections.where('sessionId').equals(Number(sessionId)).sortBy('order');
        if (cancelled) return;
        setSections(allSections);

        let q = await db.questionnaires.where('sessionId').equals(Number(sessionId)).first();
        if (!q && !cancelled) {
          const qId = await db.questionnaires.add({ sessionId: Number(sessionId), createdAt: new Date() });
          q = { id: qId, sessionId: Number(sessionId), createdAt: new Date() };
        }
        if (cancelled) return;
        setQuestionnaire(q);

        const existingItems = await db.questionnaireItems.where('questionnaireId').equals(q.id).toArray();
        if (cancelled) return;
        setItems(existingItems);

        // Load all questions from all sections
        const allQuestions = [];
        for (const sec of allSections) {
          const qs = await db.questions.where('sectionId').equals(sec.id).toArray();
          for (const q of qs) allQuestions.push(q);
        }
        if (!cancelled) setReadingQuestions(allQuestions);
      } catch (err) {
        if (!cancelled) { console.error('Error loading questionnaire:', err); setError('Error al cargar el cuestionario.'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  const toggleReadingSelected = useCallback((id) => {
    setReadingSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (readingSelected.size === 0 || !questionnaire) return;

    const newItems = [];
    for (const qId of readingSelected) {
      const q = readingQuestions.find((rq) => rq.id === qId);
      if (!q) continue;
      newItems.push({
        questionnaireId: questionnaire.id,
        sectionId: q.sectionId,
        questionText: q.text,
        source: 'manual',
        sourceQuestionId: q.id,
      });
    }

    try {
      const ids = await db.questionnaireItems.bulkAdd(newItems, { allKeys: true });
      const saved = newItems.map((item, i) => ({ ...item, id: ids[i] }));
      setItems((prev) => [...prev, ...saved]);
      setReadingSelected(new Set());
      setSaveStatus({ type: 'success', message: `${ids.length} pregunta${ids.length !== 1 ? 's' : ''} importada${ids.length !== 1 ? 's' : ''}.` });
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      console.error('Error importing:', err);
      setSaveStatus({ type: 'error', message: 'Error al importar preguntas.' });
    }
  }, [readingSelected, readingQuestions, questionnaire]);

  const handleDeleteItem = useCallback(async (itemId) => {
    try { await db.questionnaireItems.delete(itemId); setItems((prev) => prev.filter((i) => i.id !== itemId)); }
    catch (err) { console.warn('Error deleting item:', err); }
  }, []);

  const handleGoReview = useCallback(() => {
    if (questionnaire) navigate(`/review/${questionnaire.id}`);
  }, [questionnaire, navigate]);

  const getSectionLabel = (id) => {
    const sec = sections.find((s) => String(s.id) === String(id));
    return sec ? sec.title : '—';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Cargando cuestionario...</p>
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
          <button type="button" onClick={() => navigate('/')} className="mt-3 px-4 py-2 text-sm font-medium bg-red-100 text-red-800 rounded-md hover:bg-red-200 transition-colors" style={{ minHeight: '44px', minWidth: '44px' }}>Volver al inicio</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-64px)]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 px-4 py-4 bg-white dark:bg-surface border-b border-gray-200 dark:border-default">
        <h1 className="text-xl font-bold text-purple-900 dark:text-purple-300 font-heading">Cuestionario</h1>
        <p className="text-xs text-gray-500 dark:text-muted mt-1">
          Selecciona las preguntas que escribiste durante la lectura para llevarlas al repaso espaciado.
        </p>
      </header>

      {/* ── Save status ──────────────────────────────────────────────────── */}
      {saveStatus && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded-lg text-xs font-medium ${
          saveStatus.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`} role="status">
          {saveStatus.message}
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {readingQuestions.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen size={40} className="mx-auto text-gray-300 mb-3" aria-hidden="true" />
            <p className="text-gray-500 text-sm">No hay preguntas de lectura.</p>
            <p className="text-gray-400 text-xs mt-1">Escribe preguntas en la Lectura Interrogativa primero.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700 dark:text-foreground">
                {readingQuestions.length} pregunta{readingQuestions.length !== 1 ? 's' : ''}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (readingSelected.size === readingQuestions.length) setReadingSelected(new Set());
                  else setReadingSelected(new Set(readingQuestions.map((q) => q.id)));
                }}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                style={{ minHeight: '44px' }}
              >
                {readingSelected.size === readingQuestions.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
              </button>
            </div>

            <ul className="flex flex-col gap-2">
              {readingQuestions.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => toggleReadingSelected(q.id)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                      readingSelected.has(q.id)
                        ? 'border-purple-300 bg-purple-50 dark:bg-purple-950 dark:border-purple-700'
                        : 'border-gray-200 dark:border-default bg-white dark:bg-surface hover:border-gray-300'
                    }`}
                    style={{ minHeight: '44px' }}
                  >
                    <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      readingSelected.has(q.id) ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300'
                    }`}>
                      {readingSelected.has(q.id) && <Check size={12} />}
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm text-gray-800 dark:text-foreground">{q.text}</p>
                      <p className="text-xs text-gray-400 mt-1">{getSectionLabel(q.sectionId)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={handleImport}
              disabled={readingSelected.size === 0}
              className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
              style={{ minHeight: '44px' }}
            >
              Importar al cuestionario ({readingSelected.size} pregunta{readingSelected.size !== 1 ? 's' : ''})
            </button>
          </div>
        )}

        {/* Already imported items */}
        {items.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium text-gray-500 dark:text-muted mb-2">
              {items.length} pregunta{items.length !== 1 ? 's' : ''} en el cuestionario
            </p>
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-muted border border-gray-100 dark:border-default group">
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-purple-100 text-purple-600 text-xs">
                    {item.source === 'ai' ? <Bot size={14} aria-hidden="true" /> : <PenSquare size={14} aria-hidden="true" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-foreground">{item.questionText}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{getSectionLabel(item.sectionId)}</p>
                  </div>
                  <button type="button" onClick={() => handleDeleteItem(item.id)} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity" style={{ minHeight: '24px', minWidth: '24px' }} aria-label="Eliminar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Bottom: go to review ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 p-4 bg-white dark:bg-surface border-t border-gray-200 dark:border-default">
        <button
          type="button"
          onClick={handleGoReview}
          disabled={items.length === 0}
          className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
          style={{ minHeight: '44px' }}
        >
          {items.length === 0 ? 'Importa preguntas para repasar' : `Ir al repaso (${items.length} pregunta${items.length !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  );
}
