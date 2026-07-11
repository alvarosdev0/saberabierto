import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import db from '../services/db.js';
import { calculateNextReview } from '../services/sm2.js';
import ScoreSelector from '../components/ScoreSelector.jsx';
import StaleSubjectBanner from '../components/StaleSubjectBanner.jsx';

/**
 * SpacedRetrieval — due review queue with SM-2 scoring.
 *
 * Routes: /review (all due) | /review/:questionnaireId (filtered)
 *
 * Per design §Component Tree:
 *   ReviewQueue (due items) → QuestionCard (flip) → ScoreSelector
 *   StaleSubjectBanner (when >90 days)
 *   Review history (past attempts with scores)
 *
 * Flip-card UX:
 *   Front: question text + "Mostrar respuesta" button
 *   Back:  question text (repeated) + ScoreSelector (0-3)
 *   After scoring: SM-2 computes next review, writes attempt, advances queue
 */

// ── Helper: start of today (midnight) ───────────────────────────────────────
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Helper: format relative date ──────────────────────────────────────────
function formatRelative(date) {
  if (!date) return '—';
  const now = new Date();
  const d = new Date(date);
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'mañana';
  if (diffDays === -1) return 'ayer';
  if (diffDays > 0 && diffDays <= 30) return `en ${diffDays} días`;
  if (diffDays < 0 && diffDays >= -30) return `hace ${Math.abs(diffDays)} días`;

  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Helper: score label ────────────────────────────────────────────────────
function scoreLabel(score) {
  switch (score) {
    case 0: return 'Olvidé';
    case 1: return 'Parcial';
    case 2: return 'Correcto';
    case 3: return 'Perfecto';
    default: return '—';
  }
}

// ── Helper: score emoji ────────────────────────────────────────────────────
function scoreEmoji(score) {
  switch (score) {
    case 0: return '😕';
    case 1: return '🤔';
    case 2: return '💪';
    case 3: return '✨';
    default: return '';
  }
}

export default function SpacedRetrieval() {
  const { questionnaireId } = useParams();
  const navigate = useNavigate();

  // ── Data state ──────────────────────────────────────────────────────────
  const [dueQueue, setDueQueue] = useState([]); // items due for review
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentItem, setCurrentItem] = useState(null);
  const [latestAttempt, setLatestAttempt] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // ── UI state ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [scoring, setScoring] = useState(false);

  // ── History state ───────────────────────────────────────────────────────
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // ── Load due queue ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Get questionnaireItems (optionally filtered)
        let items;
        if (questionnaireId) {
          items = await db.questionnaireItems
            .where('questionnaireId')
            .equals(Number(questionnaireId))
            .toArray();
        } else {
          items = await db.questionnaireItems.toArray();
        }

        if (cancelled) return;
        if (items.length === 0) {
          setDueQueue([]);
          setLoading(false);
          return;
        }

        // Determine sessionId from first item's questionnaire
        let sid = null;
        if (questionnaireId) {
          const q = await db.questionnaires.get(Number(questionnaireId));
          if (q) sid = q.sessionId;
        }

        // For each item, find latest attempt and check if due
        const due = [];
        const today = startOfToday();

        for (const item of items) {
          const attempts = await db.reviewAttempts
            .where('questionnaireItemId')
            .equals(item.id)
            .reverse()
            .sortBy('reviewedAt');

          if (cancelled) return;

          if (attempts.length === 0) {
            // Never reviewed → due immediately
            due.push({ item, latestAttempt: null });
            if (!sid && item.questionnaireId) {
              const q = await db.questionnaires.get(item.questionnaireId);
              if (q) sid = q.sessionId;
            }
          } else {
            const latest = attempts[0];
            const nextDate = new Date(latest.nextReview);
            if (nextDate <= today) {
              due.push({ item, latestAttempt: latest });
              if (!sid) sid = latest.sessionId;
            }
          }
        }

        if (cancelled) return;
        setDueQueue(due);
        setSessionId(sid);

        if (due.length > 0) {
          setCurrentItem(due[0].item);
          setLatestAttempt(due[0].latestAttempt);
          // Load history for first item
          loadHistory(due[0].item.id);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading review queue:', err);
          setError('Error al cargar la cola de repaso.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [questionnaireId]);

  // ── Load history for an item ──────────────────────────────────────────
  const loadHistory = useCallback(async (itemId) => {
    try {
      const attempts = await db.reviewAttempts
        .where('questionnaireItemId')
        .equals(itemId)
        .reverse()
        .sortBy('reviewedAt');
      setHistory(attempts);
    } catch (err) {
      console.warn('Error loading history:', err);
    }
  }, []);

  // ── Flip card ──────────────────────────────────────────────────────────
  const handleFlip = useCallback(() => {
    setFlipped(true);
  }, []);

  // ── Handle score selection ────────────────────────────────────────────
  const handleScore = useCallback(
    async (score) => {
      setScoring(true);

      const item = currentItem;
      const prev = latestAttempt;
      const sid =
        sessionId ||
        prev?.sessionId ||
        (questionnaireId ? null : item.questionnaireId);

      try {
        // Determine previous SM-2 state
        const prevReps = prev?.repetitions ?? 0;
        const prevInterval = prev?.interval ?? 0;

        // Calculate next review
        const next = calculateNextReview(score, prevReps, prevInterval);

        // Resolve sessionId
        let resolvedSessionId = sid;
        if (!resolvedSessionId && item.questionnaireId) {
          const q = await db.questionnaires.get(item.questionnaireId);
          resolvedSessionId = q?.sessionId;
        }

        // Write new attempt
        const attempt = {
          questionnaireItemId: item.id,
          sessionId: resolvedSessionId,
          score,
          repetitions: next.repetitions,
          interval: next.interval,
          reviewedAt: new Date(),
          nextReview: next.nextReviewDate,
        };

        await db.reviewAttempts.add(attempt);

        // Advance to next item or clear
        const nextIndex = currentIndex + 1;
        if (nextIndex < dueQueue.length) {
          setCurrentIndex(nextIndex);
          setCurrentItem(dueQueue[nextIndex].item);
          setLatestAttempt(dueQueue[nextIndex].latestAttempt);
          setFlipped(false);
          loadHistory(dueQueue[nextIndex].item.id);
        } else {
          setCurrentIndex(dueQueue.length); // mark as done
          setCurrentItem(null);
          setFlipped(false);
          setHistory([]);
        }
      } catch (err) {
        console.error('Error saving review attempt:', err);
      } finally {
        setScoring(false);
      }
    },
    [
      currentItem,
      latestAttempt,
      sessionId,
      questionnaireId,
      currentIndex,
      dueQueue,
      loadHistory,
    ],
  );

  // ── Render states ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Cargando repasos...</p>
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
          Repaso Espaciado
        </h1>
        <p className="text-sm text-gray-500 dark:text-muted mt-1">
          {questionnaireId
            ? 'Repaso enfocado de un cuestionario'
            : 'Cola de repaso de todos los cuestionarios'}
        </p>
      </header>

      {/* ── Stale subject banner ────────────────────────────────────────── */}
      {sessionId && (
        <div className="flex-shrink-0 px-4 pt-3">
          <StaleSubjectBanner sessionId={sessionId} />
        </div>
      )}

      {/* ── Progress indicator ──────────────────────────────────────────── */}
      {dueQueue.length > 0 && currentIndex < dueQueue.length && (
        <div className="flex-shrink-0 px-4 pt-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>
              {currentIndex + 1} de {dueQueue.length}
            </span>
            <span>{Math.round(((currentIndex) / dueQueue.length) * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-[width] duration-300"
              style={{ width: `${((currentIndex) / dueQueue.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Empty state — no questionnaires */}
        {dueQueue.length === 0 && !questionnaireId && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="text-5xl mb-4">📚</span>
            <h2 className="text-lg font-bold text-gray-700 dark:text-foreground mb-2">
              ¡Todo al día!
            </h2>
            <p className="text-sm text-gray-500 dark:text-muted mb-6">
              No tienes repasos pendientes. Crea cuestionarios desde tus sesiones de estudio para comenzar.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-6 py-3 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm"
              style={{ minHeight: 'var(--touch-target-min)' }}
            >
              Ir al inicio
            </button>
          </div>
        )}

        {/* Empty state — specific questionnaire has no items */}
        {dueQueue.length === 0 && questionnaireId && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="text-5xl mb-4">✅</span>
            <h2 className="text-lg font-bold text-gray-700 dark:text-foreground mb-2">
              Sin repasos pendientes
            </h2>
            <p className="text-sm text-gray-500 dark:text-muted mb-6">
              Todas las preguntas de este cuestionario están al día.
            </p>
            <button
              type="button"
              onClick={() => navigate('/review')}
              className="px-6 py-3 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm"
              style={{ minHeight: 'var(--touch-target-min)' }}
            >
              Ver todos los repasos
            </button>
          </div>
        )}

        {/* All done — finished the queue */}
        {currentIndex >= dueQueue.length && dueQueue.length > 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="text-5xl mb-4">🎉</span>
            <h2 className="text-lg font-bold text-emerald-700 mb-2">
              ¡Repaso completado!
            </h2>
            <p className="text-sm text-gray-500 dark:text-muted mb-1">
              Has repasado {dueQueue.length} pregunta{dueQueue.length !== 1 ? 's' : ''}.
            </p>
            <p className="text-xs text-gray-400 mb-6">
              Vuelve cuando tengas más repasos pendientes.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-5 py-2.5 text-sm font-semibold rounded-xl border border-gray-300 dark:border-default text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                style={{ minHeight: 'var(--touch-target-min)' }}
              >
                Inicio
              </button>
              {questionnaireId && (
                <button
                  type="button"
                  onClick={() => navigate('/review')}
                  className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm"
                  style={{ minHeight: 'var(--touch-target-min)' }}
                >
                  Todos los repasos
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Question Card (flip) ─────────────────────────────────────── */}
        {currentItem && currentIndex < dueQueue.length && (
          <div className="flex flex-col gap-4">
            {/* Section hint */}
            <p className="text-xs text-gray-400 text-center">
              Sección:{' '}
              <SectionLabel sectionId={currentItem.sectionId} />
            </p>

            {/* Previous attempt info */}
            {latestAttempt && (
              <p className="text-xs text-gray-400 text-center">
                Último repaso: {formatRelative(latestAttempt.reviewedAt)} ·{' '}
                {scoreEmoji(latestAttempt.score)} {scoreLabel(latestAttempt.score)}
                {latestAttempt.interval > 0 && (
                  <> · Intervalo: {latestAttempt.interval} día{latestAttempt.interval !== 1 ? 's' : ''}</>
                )}
              </p>
            )}

            {/* Card */}
            <div
              className={`
                relative w-full rounded-2xl border-2 transition-[border-color,background-color,box-shadow] duration-300
                ${flipped
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-purple-200 bg-white dark:bg-surface cursor-pointer hover:border-purple-300 hover:shadow-md'
                }
              `}
              style={{ minHeight: '200px' }}
            >
              {/* Front: question */}
              {!flipped && (
                <div className="flex flex-col items-center justify-center p-6 min-h-[200px] gap-4">
                  <p className="text-lg font-medium text-gray-800 dark:text-foreground text-center leading-relaxed">
                    {currentItem.questionText}
                  </p>
                  <button
                    type="button"
                    onClick={handleFlip}
                    className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm"
                    style={{ minHeight: 'var(--touch-target-min)' }}
                  >
                    Mostrar respuesta
                  </button>
                  {latestAttempt && (
                    <p className="text-[11px] text-gray-400">
                      Repasado {latestAttempt.repetitions || 0} vez
                      {latestAttempt.repetitions !== 1 ? 'ces' : ''}
                    </p>
                  )}
                </div>
              )}

              {/* Back: question + score selector */}
              {flipped && (
                <div className="flex flex-col p-6 gap-4">
                  <p className="text-lg font-medium text-gray-800 dark:text-foreground text-center leading-relaxed">
                    {currentItem.questionText}
                  </p>
                  <ScoreSelector
                    onSelect={handleScore}
                    disabled={scoring}
                  />
                  {scoring && (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-purple-600 rounded-full animate-spin" />
                      Guardando...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── History toggle ──────────────────────────────────────── */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowHistory((s) => !s);
                  if (!showHistory && currentItem) loadHistory(currentItem.id);
                }}
                className="text-xs text-purple-600 hover:text-purple-800 self-center font-medium"
                style={{ minHeight: 'var(--touch-target-min)' }}
              >
                {showHistory ? 'Ocultar historial' : 'Ver historial de repasos'}
              </button>

              {showHistory && (
                <HistoryList history={history} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SectionLabel helper ─────────────────────────────────────────────────────

function SectionLabel({ sectionId }) {
  const [title, setTitle] = useState('...');

  useEffect(() => {
    let cancelled = false;
    db.sections.get(sectionId).then((s) => {
      if (!cancelled && s) setTitle(s.title);
    });
    return () => { cancelled = true; };
  }, [sectionId]);

  return <span className="text-gray-600 font-medium">{title}</span>;
}

// ── HistoryList ─────────────────────────────────────────────────────────────

/**
 * Renders past reviewAttempts for an item.
 *
 * @param {object} props
 * @param {Array}  props.history — Review attempts (newest first)
 */
function HistoryList({ history }) {
  if (history.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic text-center py-2">
        Sin historial — este será el primer repaso.
      </p>
    );
  }

  return (
    <div className="bg-white dark:bg-surface border border-gray-200 dark:border-default rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 dark:bg-muted border-b border-gray-100 dark:border-default">
        <p className="text-xs font-semibold text-gray-600 dark:text-muted">
          Historial ({history.length} repaso{history.length !== 1 ? 's' : ''})
        </p>
      </div>
      <ul className="divide-y divide-gray-100">
        {history.map((attempt, idx) => (
          <li
            key={attempt.id || idx}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <span className="text-base flex-shrink-0">
              {scoreEmoji(attempt.score)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 dark:text-foreground">
                {scoreLabel(attempt.score)}
              </p>
              <p className="text-[11px] text-gray-400">
                {formatRelative(attempt.reviewedAt)}
                {attempt.interval > 0 && (
                  <> · Próximo en {attempt.interval} día{attempt.interval !== 1 ? 's' : ''}</>
                )}
                {attempt.repetitions > 0 && (
                  <> · {attempt.repetitions} repeticion{attempt.repetitions !== 1 ? 'es' : ''}</>
                )}
              </p>
            </div>
            {/* Interval badge */}
            {attempt.interval > 0 && (
              <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-100 text-purple-700">
                +{attempt.interval}d
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
