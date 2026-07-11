import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import db from '../services/db.js';
import { createProvider } from '../services/ai/index.js';

/**
 * QuestionnaireBuilder — create exam questionnaires with manual entries,
 * AI-generated questions, and import from interrogative reading.
 *
 * Route: /session/:id/questionnaire
 *
 * Per design §Component Tree:
 *   Tabs: Manual | IA | Lectura
 *
 *   Manual: text input + SectionSelector + add button
 *   IA:     SectionSelector → generate AI questions → multi-select → import
 *   Lectura: list reading questions per section → multi-select → import
 */

// ── localStorage helpers ────────────────────────────────────────────────────
const LS_PROVIDER_KEY = 'sa:provider';
const lsApiKey = (provider) => `sa:apiKey:${provider}`;

// ── Tab definitions ─────────────────────────────────────────────────────────
const TABS = [
  { key: 'manual', label: 'Manual', icon: '✍️' },
  { key: 'ai', label: 'IA', icon: '🤖' },
  { key: 'reading', label: 'Lectura', icon: '📖' },
];

export default function QuestionnaireBuilder() {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();

  // ── Core state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('manual');
  const [sections, setSections] = useState([]);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Manual tab state ────────────────────────────────────────────────────
  const [manualText, setManualText] = useState('');
  const [manualSectionId, setManualSectionId] = useState('');

  // ── AI tab state ────────────────────────────────────────────────────────
  const [aiSectionId, setAiSectionId] = useState('');
  const [aiLanguage, setAiLanguage] = useState(() => localStorage.getItem('sa:language') || 'es');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiQuestions, setAiQuestions] = useState([]);
  const [aiSelected, setAiSelected] = useState(new Set());
  const [aiError, setAiError] = useState(null);
  const [aiCost, setAiCost] = useState(null);
  const [aiEstimatedCost, setAiEstimatedCost] = useState(null);
  const [aiConfirming, setAiConfirming] = useState(false);
  const [aiContentPreview, setAiContentPreview] = useState('');

  // ── Reading tab state ───────────────────────────────────────────────────
  const [readingQuestions, setReadingQuestions] = useState([]);
  const [readingSelected, setReadingSelected] = useState(new Set());
  const [readingLoading, setReadingLoading] = useState(false);

  // ── Shared state ────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState(null); // { type, message }

  // ── Load session, sections, questionnaire, items ──────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Load sections for this session
        const allSections = await db.sections
          .where('sessionId')
          .equals(Number(sessionId))
          .sortBy('order');
        if (cancelled) return;
        setSections(allSections);

        // Set default section selections
        if (allSections.length > 0) {
          setManualSectionId(String(allSections[0].id));
          setAiSectionId(String(allSections[0].id));
        }

        // Find or create questionnaire for this session
        let q = await db.questionnaires
          .where('sessionId')
          .equals(Number(sessionId))
          .first();

        if (!q && !cancelled) {
          const qId = await db.questionnaires.add({
            sessionId: Number(sessionId),
            createdAt: new Date(),
          });
          q = { id: qId, sessionId: Number(sessionId), createdAt: new Date() };
        }
        if (cancelled) return;
        setQuestionnaire(q);

        // Load existing items
        const existingItems = await db.questionnaireItems
          .where('questionnaireId')
          .equals(q.id)
          .toArray();
        if (cancelled) return;
        setItems(existingItems);
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading questionnaire:', err);
          setError('Error al cargar el cuestionario.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  // ── Manual: add question ──────────────────────────────────────────────
  const handleManualAdd = useCallback(async () => {
    const trimmed = manualText.trim();
    if (!trimmed) return;

    const sectionIdNum = Number(manualSectionId);
    if (!sectionIdNum || isNaN(sectionIdNum)) {
      setSaveStatus({ type: 'error', message: 'Selecciona una sección.' });
      return;
    }

    try {
      const newItem = {
        questionnaireId: questionnaire.id,
        sectionId: sectionIdNum,
        questionText: trimmed,
        source: 'manual',
      };

      const id = await db.questionnaireItems.add(newItem);
      const saved = { ...newItem, id };
      setItems((prev) => [...prev, saved]);
      setManualText('');
      setSaveStatus({ type: 'success', message: 'Pregunta añadida.' });
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Error adding manual question:', err);
      setSaveStatus({ type: 'error', message: 'Error al guardar la pregunta.' });
    }
  }, [manualText, manualSectionId, questionnaire]);

  const handleManualKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleManualAdd();
      }
    },
    [handleManualAdd],
  );

  // ── AI: estimate cost & show confirmation ─────────────────────────────
  const handleAIEstimate = useCallback(async () => {
    const sectionIdNum = Number(aiSectionId);
    if (!sectionIdNum || isNaN(sectionIdNum)) return;

    const providerId = localStorage.getItem(LS_PROVIDER_KEY) || 'deepseek';
    const apiKey = localStorage.getItem(lsApiKey(providerId));

    if (!apiKey) {
      setAiError('No hay clave API configurada. Ve a Ajustes para configurarla.');
      return;
    }

    setAiError(null);
    setAiQuestions([]);
    setAiSelected(new Set());
    setAiCost(null);
    setAiEstimatedCost(null);
    setAiConfirming(false);

    try {
      // Load markdown for the selected section
      const note = await db.notes
        .where('sectionId')
        .equals(sectionIdNum)
        .first();

      if (!note || !note.text) {
        setAiError('Esta sección no tiene contenido. Extrae el PDF primero.');
        return;
      }

      const provider = createProvider(providerId, apiKey);

      // Show preview + cost estimate before generating
      const preview = note.text.length > 300
        ? note.text.substring(0, 300) + '...'
        : note.text;

      let estimated = null;
      if (typeof provider.estimateRequestCost === 'function') {
        estimated = provider.estimateRequestCost(note.text);
      }

      setAiContentPreview(preview);
      setAiEstimatedCost(estimated);
      setAiConfirming(true);
    } catch (err) {
      console.error('Error estimating cost:', err);
      setAiError(
        err.message || 'Error al preparar la generación. Verifica tu clave API.',
      );
    }
  }, [aiSectionId]);

  // ── AI: generate questions (after confirmation) ────────────────────────
  const handleAIConfirmGenerate = useCallback(async () => {
    const sectionIdNum = Number(aiSectionId);
    if (!sectionIdNum || isNaN(sectionIdNum)) return;

    const providerId = localStorage.getItem(LS_PROVIDER_KEY) || 'deepseek';
    const apiKey = localStorage.getItem(lsApiKey(providerId));

    setAiGenerating(true);
    setAiConfirming(false);
    setAiError(null);

    try {
      const note = await db.notes
        .where('sectionId')
        .equals(sectionIdNum)
        .first();

      if (!note || !note.text) {
        setAiError('Esta sección no tiene contenido. Extrae el PDF primero.');
        setAiGenerating(false);
        return;
      }

      const provider = createProvider(providerId, apiKey);
      const result = await provider.generateQuestions(note.text, {
        count: 5,
        language: aiLanguage,
      });

      if (result.error) {
        setAiError(result.error);
      } else if (result.questions && result.questions.length > 0) {
        setAiQuestions(result.questions);
      } else {
        setAiError('No se generaron preguntas. Intenta con otra sección.');
      }
    } catch (err) {
      console.error('AI generation error:', err);
      setAiError(
        err.message || 'Error al generar preguntas. Verifica tu clave API e intenta de nuevo.',
      );
    } finally {
      setAiGenerating(false);
    }
  }, [aiSectionId, aiLanguage]);

  const cancelAIConfirm = useCallback(() => {
    setAiConfirming(false);
    setAiEstimatedCost(null);
    setAiContentPreview('');
  }, []);

  const toggleAISelected = useCallback((index) => {
    setAiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleAIImport = useCallback(async () => {
    if (aiSelected.size === 0) return;

    const sectionIdNum = Number(aiSectionId);
    const newItems = [];

    for (const idx of aiSelected) {
      const q = aiQuestions[idx];
      if (!q) continue;
      newItems.push({
        questionnaireId: questionnaire.id,
        sectionId: sectionIdNum,
        questionText: q.text,
        source: 'ai',
        sourceProvider: q.type || 'keyword',
      });
    }

    try {
      const ids = await db.questionnaireItems.bulkAdd(newItems, { allKeys: true });
      const saved = newItems.map((item, i) => ({ ...item, id: ids[i] }));
      setItems((prev) => [...prev, ...saved]);
      setAiSelected(new Set());
      setSaveStatus({
        type: 'success',
        message: `${ids.length} pregunta${ids.length !== 1 ? 's' : ''} importada${ids.length !== 1 ? 's' : ''}.`,
      });
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      console.error('Error importing AI questions:', err);
      setSaveStatus({ type: 'error', message: 'Error al importar preguntas.' });
    }
  }, [aiSelected, aiQuestions, aiSectionId, questionnaire]);

  // ── Reading: load questions ────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'reading') return;
    if (sections.length === 0) return;

    let cancelled = false;

    async function loadReading() {
      setReadingLoading(true);
      try {
        const sectionIds = sections.map((s) => s.id);
        // Collect questions for all sections of this session
        const allQuestions = [];
        for (const sid of sectionIds) {
          const qs = await db.questions
            .where('sectionId')
            .equals(sid)
            .toArray();
          for (const q of qs) {
            allQuestions.push(q);
          }
        }
        if (cancelled) return;
        setReadingQuestions(allQuestions);
      } catch (err) {
        console.error('Error loading reading questions:', err);
      } finally {
        if (!cancelled) setReadingLoading(false);
      }
    }

    loadReading();
    return () => { cancelled = true; };
  }, [activeTab, sections]);

  const toggleReadingSelected = useCallback((id) => {
    setReadingSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleReadingImport = useCallback(async () => {
    if (readingSelected.size === 0) return;

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
      setSaveStatus({
        type: 'success',
        message: `${ids.length} pregunta${ids.length !== 1 ? 's' : ''} importada${ids.length !== 1 ? 's' : ''} desde lectura.`,
      });
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      console.error('Error importing reading questions:', err);
      setSaveStatus({ type: 'error', message: 'Error al importar preguntas.' });
    }
  }, [readingSelected, readingQuestions, questionnaire]);

  // ── Delete item ─────────────────────────────────────────────────────────
  const handleDeleteItem = useCallback(async (itemId) => {
    try {
      await db.questionnaireItems.delete(itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      console.warn('Error deleting item:', err);
    }
  }, []);

  // ── Navigate to review ─────────────────────────────────────────────────
  const handleGoReview = useCallback(() => {
    if (questionnaire) {
      navigate(`/review/${questionnaire.id}`);
    }
  }, [questionnaire, navigate]);

  // ── Section selector helper ────────────────────────────────────────────
  const getSectionLabel = (id) => {
    const sec = sections.find((s) => String(s.id) === String(id));
    return sec ? sec.title : '—';
  };

  // ── Render states ─────────────────────────────────────────────────────
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
    <div className="flex flex-col min-h-[calc(100dvh-64px)]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 px-4 py-4 bg-white dark:bg-surface border-b border-gray-100 dark:border-default">
        <h1 className="text-xl font-bold text-purple-900 font-heading">
          Cuestionario
        </h1>
        <p className="text-sm text-gray-500 dark:text-muted mt-1">
          Crea preguntas de examen para repaso espaciado
        </p>
      </header>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex bg-white dark:bg-surface border-b border-gray-100 dark:border-default flex-shrink-0"
        role="tablist"
        aria-label="Origen de preguntas"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === activeTab}
            onClick={() => setActiveTab(tab.key)}
            className={`
              flex-1 flex items-center justify-center gap-1 px-2 py-3 text-xs font-medium transition-colors border-b-2
              ${tab.key === activeTab
                ? 'border-purple-600 text-purple-700 bg-purple-50'
                : 'border-transparent text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground'
              }
            `}
            style={{ minHeight: 'var(--touch-target-min)' }}
          >
            <span className="text-sm">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Save status toast ────────────────────────────────────────────── */}
      {saveStatus && (
        <div
          className={`flex-shrink-0 mx-4 mt-3 px-3 py-2 rounded-lg text-xs font-medium ${
            saveStatus.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
          role="status"
        >
          {saveStatus.message}
        </div>
      )}

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* === MANUAL TAB ================================================= */}
        {activeTab === 'manual' && (
          <div className="flex flex-col gap-4">
            {/* Guidance text */}
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg text-sm text-purple-800">
              <p className="font-semibold mb-1">Forza la elaboración</p>
              <p className="text-xs text-purple-600">
                Formula preguntas que te obliguen a reconstruir el conocimiento,
                no solo a reconocerlo. Evita preguntas de opción múltiple obvias;
                busca que tengas que explicar, relacionar o aplicar conceptos.
              </p>
            </div>

            {/* Section selector */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="manual-section" className="text-xs font-medium text-gray-600 dark:text-muted">
                Sección
              </label>
              <select
                id="manual-section"
                value={manualSectionId}
                onChange={(e) => setManualSectionId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-default rounded-lg bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none"
                style={{ minHeight: 'var(--touch-target-min)' }}
              >
                {sections.length === 0 ? (
                  <option value="">Sin secciones</option>
                ) : (
                  sections.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.title}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Question text input */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="manual-text" className="text-xs font-medium text-gray-600">
                Pregunta
              </label>
              <textarea
                id="manual-text"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                onKeyDown={handleManualKeyDown}
                placeholder="Escribe tu pregunta de examen..."
                rows={3}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-default rounded-lg bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none resize-y"
              />
            </div>

            {/* Add button */}
            <button
              type="button"
              onClick={handleManualAdd}
              disabled={!manualText.trim()}
              className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
              style={{ minHeight: 'var(--touch-target-min)' }}
            >
              Añadir pregunta
            </button>

            {/* Existing items */}
            {items.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 dark:text-muted mb-2">
                  {items.length} pregunta{items.length !== 1 ? 's' : ''} en el cuestionario
                </p>
                <ItemList
                  items={items}
                  sections={sections}
                  onDelete={handleDeleteItem}
                />
              </div>
            )}
          </div>
        )}

        {/* === AI TAB ==================================================== */}
        {activeTab === 'ai' && (
          <div className="flex flex-col gap-4">
            {/* Section selector */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ai-section" className="text-xs font-medium text-gray-600 dark:text-muted">
                Sección para generar preguntas
              </label>
              <select
                id="ai-section"
                value={aiSectionId}
                onChange={(e) => setAiSectionId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-default rounded-lg bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none"
                style={{ minHeight: 'var(--touch-target-min)' }}
              >
                {sections.length === 0 ? (
                  <option value="">Sin secciones</option>
                ) : (
                  sections.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.title}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Language selector */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ai-language" className="text-xs font-medium text-gray-600 dark:text-muted">
                Idioma de las preguntas
              </label>
              <select
                id="ai-language"
                value={aiLanguage}
                onChange={(e) => {
                  setAiLanguage(e.target.value);
                  localStorage.setItem('sa:language', e.target.value);
                }}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-default rounded-lg bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none"
                style={{ minHeight: 'var(--touch-target-min)' }}
              >
                <option value="es">Español — las preguntas se generan en español</option>
                <option value="en">English — questions will be generated in English</option>
              </select>
            </div>

            {/* Confirmation step: show cost + preview before generating */}
            {aiConfirming ? (
              <div className="flex flex-col gap-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 text-lg mt-0.5">⚠️</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      ¿Confirmas la generación?
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      Se usarán tokens de tu API key para generar preguntas.
                    </p>
                  </div>
                </div>

                {/* Content preview */}
                <div className="bg-white rounded-lg p-3 max-h-24 overflow-y-auto">
                  <p className="text-xs text-gray-400 font-medium mb-1">Vista previa del texto:</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{aiContentPreview}</p>
                </div>

                {/* Cost estimate */}
                {aiEstimatedCost && (
                  <div className="bg-white rounded-lg p-3 flex flex-col gap-1">
                    <p className="text-xs text-gray-400 font-medium">Costo estimado:</p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-600">
                        ~{aiEstimatedCost.inputTokens.toLocaleString()} tokens de entrada
                      </span>
                      <span className="font-semibold text-amber-700">
                        ${aiEstimatedCost.totalCost < 0.0001
                          ? '< 0.0001'
                          : aiEstimatedCost.totalCost.toFixed(5)}
                        {' '}USD
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {aiLanguage === 'en'
                        ? 'The actual cost depends on the length of the AI response.'
                        : 'El costo real depende de la longitud de la respuesta de la IA.'}
                    </p>
                  </div>
                )}

                {/* Confirm / Cancel */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={cancelAIConfirm}
                    className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-300 dark:border-default text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    style={{ minHeight: 'var(--touch-target-min)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAIConfirmGenerate}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-sm"
                    style={{ minHeight: 'var(--touch-target-min)' }}
                  >
                    Sí, generar preguntas
                  </button>
                </div>
              </div>
            ) : (
              /* Estimate cost button (not confirming, not generating) */
              <button
                type="button"
                onClick={handleAIEstimate}
                disabled={aiGenerating || sections.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-[background,box-shadow] shadow-sm"
                style={{ minHeight: 'var(--touch-target-min)' }}
              >
                {aiGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generando preguntas...
                  </>
                ) : (
                  <>
                    <span>🤖</span>
                    Generar preguntas con IA
                  </>
                )}
              </button>
            )}

            {/* AI error */}
            {aiError && (
              <div
                role="alert"
                className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
              >
                {aiError}
              </div>
            )}

            {/* Generated questions */}
            {aiQuestions.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-foreground">
                    {aiQuestions.length} pregunta{aiQuestions.length !== 1 ? 's' : ''} generada{aiQuestions.length !== 1 ? 's' : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (aiSelected.size === aiQuestions.length) {
                        setAiSelected(new Set());
                      } else {
                        setAiSelected(new Set(aiQuestions.map((_, i) => i)));
                      }
                    }}
                    className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    style={{ minHeight: 'var(--touch-target-min)' }}
                  >
                    {aiSelected.size === aiQuestions.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                  </button>
                </div>

                <ul className="flex flex-col gap-2">
                  {aiQuestions.map((q, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => toggleAISelected(idx)}
                        className={`
                          w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-[border-color,background-color]
                          ${aiSelected.has(idx)
                            ? 'border-purple-300 bg-purple-50'
                            : 'border-gray-200 dark:border-default bg-white dark:bg-surface hover:border-gray-300'
                          }
                        `}
                        style={{ minHeight: 'var(--touch-target-min)' }}
                      >
                        <span
                          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            aiSelected.has(idx)
                              ? 'bg-purple-600 border-purple-600 text-white'
                              : 'border-gray-300'
                          }`}
                        >
                          {aiSelected.has(idx) && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 dark:text-foreground">{q.text}</p>
                          <p className="text-xs text-gray-400 mt-1 capitalize">{q.type}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Import button */}
                <button
                  type="button"
                  onClick={handleAIImport}
                  disabled={aiSelected.size === 0}
                  className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                  style={{ minHeight: 'var(--touch-target-min)' }}
                >
                  Importar {aiSelected.size > 0 ? `${aiSelected.size} ` : ''}seleccionada{aiSelected.size !== 1 ? 's' : ''}
                </button>
              </div>
            )}

            {/* Existing items */}
            {items.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 dark:text-muted mb-2">
                  {items.length} pregunta{items.length !== 1 ? 's' : ''} en el cuestionario
                </p>
                <ItemList
                  items={items}
                  sections={sections}
                  onDelete={handleDeleteItem}
                />
              </div>
            )}
          </div>
        )}

        {/* === READING TAB ================================================ */}
        {activeTab === 'reading' && (
          <div className="flex flex-col gap-4">
            {readingLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
              </div>
            ) : readingQuestions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">
                  No hay preguntas de lectura para importar.
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Crea preguntas en la sección de Lectura Interrogativa primero.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-foreground">
                    {readingQuestions.length} pregunta{readingQuestions.length !== 1 ? 's' : ''} de lectura
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (readingSelected.size === readingQuestions.length) {
                        setReadingSelected(new Set());
                      } else {
                        setReadingSelected(new Set(readingQuestions.map((q) => q.id)));
                      }
                    }}
                    className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    style={{ minHeight: 'var(--touch-target-min)' }}
                  >
                    {readingSelected.size === readingQuestions.length
                      ? 'Deseleccionar todas'
                      : 'Seleccionar todas'}
                  </button>
                </div>

                <ul className="flex flex-col gap-2">
                  {readingQuestions.map((q) => (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => toggleReadingSelected(q.id)}
                        className={`
                          w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-[border-color,background-color]
                          ${readingSelected.has(q.id)
                            ? 'border-purple-300 bg-purple-50'
                            : 'border-gray-200 dark:border-default bg-white dark:bg-surface hover:border-gray-300'
                          }
                        `}
                        style={{ minHeight: 'var(--touch-target-min)' }}
                      >
                        <span
                          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            readingSelected.has(q.id)
                              ? 'bg-purple-600 border-purple-600 text-white'
                              : 'border-gray-300'
                          }`}
                        >
                          {readingSelected.has(q.id) && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 dark:text-foreground">{q.text}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {getSectionLabel(q.sectionId)} · {q.type}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Import button */}
                <button
                  type="button"
                  onClick={handleReadingImport}
                  disabled={readingSelected.size === 0}
                  className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                  style={{ minHeight: 'var(--touch-target-min)' }}
                >
                  Importar {readingSelected.size > 0 ? `${readingSelected.size} ` : ''}seleccionada{readingSelected.size !== 1 ? 's' : ''}
                </button>
              </>
            )}

            {/* Existing items */}
            {items.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 dark:text-muted mb-2">
                  {items.length} pregunta{items.length !== 1 ? 's' : ''} en el cuestionario
                </p>
                <ItemList
                  items={items}
                  sections={sections}
                  onDelete={handleDeleteItem}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom action: go to review ───────────────────────────────── */}
      <div className="flex-shrink-0 p-4 bg-white dark:bg-surface border-t border-gray-100 dark:border-default">
        <button
          type="button"
          onClick={handleGoReview}
          disabled={items.length === 0}
          className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
          style={{ minHeight: 'var(--touch-target-min)' }}
        >
          {items.length === 0
            ? 'Añade preguntas para comenzar'
            : `Ir al repaso (${items.length} pregunta${items.length !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  );
}

// ── Shared: ItemList ────────────────────────────────────────────────────────

/**
 * Renders a list of questionnaire items with delete buttons.
 *
 * @param {object} props
 * @param {Array}  props.items    — Questionnaire items
 * @param {Array}  props.sections — Sections for the session
 * @param {(id: number) => void} props.onDelete
 */
function ItemList({ items, sections, onDelete }) {
  const getSectionLabel = (id) => {
    const sec = sections.find((s) => s.id === id);
    return sec ? sec.title : '—';
  };

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-muted border border-gray-100 dark:border-default group"
        >
          <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-purple-100 text-purple-600 text-xs font-semibold">
            {item.source === 'ai' ? '🤖' : '✍️'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 dark:text-foreground">{item.questionText}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {getSectionLabel(item.sectionId)}
              {item.source === 'ai' && item.sourceProvider && (
                <> · {item.sourceProvider}</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ minHeight: '24px', minWidth: '24px' }}
            aria-label={`Eliminar "${item.questionText?.substring(0, 30)}..."`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
