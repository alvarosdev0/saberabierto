import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Frown, Meh, ThumbsUp, Sparkles, BookOpen, CheckCircle, PartyPopper } from 'lucide-react';
import { Button, Heading, Text } from '@ninna-ui/primitives';
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

// ── Helper: score icon component ────────────────────────────────────────────
function ScoreIcon({ score, size = 16 }) {
  switch (score) {
    case 0: return <Frown size={size} aria-hidden="true" className="text-danger" />;
    case 1: return <Meh size={size} aria-hidden="true" className="text-warning" />;
    case 2: return <ThumbsUp size={size} aria-hidden="true" className="text-primary" />;
    case 3: return <Sparkles size={size} aria-hidden="true" className="text-success" />;
    default: return null;
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
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <Text size="sm" className="text-base-content/50">Cargando repasos...</Text>
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
    <div className="flex flex-col min-h-[calc(100dvh-64px)]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 px-4 py-4 bg-base-100 border-b border-base-content/10">
        <Heading as="h1" size="xl" className="font-heading">
          Repaso Espaciado
        </Heading>
        <Text size="sm" className="text-base-content/50 mt-1">
          {questionnaireId
            ? 'Repaso enfocado de un cuestionario'
            : 'Cola de repaso de todos los cuestionarios'}
        </Text>
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
          <div className="flex items-center justify-between text-xs text-base-content/40 mb-1">
            <span>
              {currentIndex + 1} de {dueQueue.length}
            </span>
            <span>{Math.round(((currentIndex) / dueQueue.length) * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-base-300 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-300"
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
            <BookOpen size={48} aria-hidden="true" className="text-base-content/20 mb-4" />
            <Heading as="h2" size="lg" className="text-base-content mb-2">
              ¡Todo al día!
            </Heading>
            <Text size="sm" className="text-base-content/50 mb-6">
              No tienes repasos pendientes. Crea cuestionarios desde tus sesiones de estudio para comenzar.
            </Text>
            <Button
              color="primary"
              onClick={() => navigate('/')}
            >
              Ir al inicio
            </Button>
          </div>
        )}

        {/* Empty state — specific questionnaire has no items */}
        {dueQueue.length === 0 && questionnaireId && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle size={48} aria-hidden="true" className="text-success mb-4" />
            <Heading as="h2" size="lg" className="text-base-content mb-2">
              Sin repasos pendientes
            </Heading>
            <Text size="sm" className="text-base-content/50 mb-6">
              Todas las preguntas de este cuestionario están al día.
            </Text>
            <Button
              color="primary"
              onClick={() => navigate('/review')}
            >
              Ver todos los repasos
            </Button>
          </div>
        )}

        {/* All done — finished the queue */}
        {currentIndex >= dueQueue.length && dueQueue.length > 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <PartyPopper size={48} aria-hidden="true" className="text-success mb-4" />
            <Heading as="h2" size="lg" className="text-success mb-2">
              ¡Repaso completado!
            </Heading>
            <Text size="sm" className="text-base-content/50 mb-1">
              Has repasado {dueQueue.length} pregunta{dueQueue.length !== 1 ? 's' : ''}.
            </Text>
            <Text size="xs" className="text-base-content/40 mb-6">
              Vuelve cuando tengas más repasos pendientes.
            </Text>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/')}
              >
                Inicio
              </Button>
              {questionnaireId && (
                <Button
                  color="primary"
                  onClick={() => navigate('/review')}
                >
                  Todos los repasos
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Question Card (flip) ─────────────────────────────────────── */}
        {currentItem && currentIndex < dueQueue.length && (
          <div className="flex flex-col gap-4">
            {/* Section hint */}
            <Text size="xs" className="text-base-content/40 text-center">
              Sección:{' '}
              <SectionLabel sectionId={currentItem.sectionId} />
            </Text>

            {/* Previous attempt info */}
            {latestAttempt && (
              <Text size="xs" className="text-base-content/40 text-center">
                Último repaso: {formatRelative(latestAttempt.reviewedAt)} ·{' '}
                <ScoreIcon score={latestAttempt.score} size={16} />{' '}{scoreLabel(latestAttempt.score)}
                {latestAttempt.interval > 0 && (
                  <> · Intervalo: {latestAttempt.interval} día{latestAttempt.interval !== 1 ? 's' : ''}</>
                )}
              </Text>
            )}

            {/* Card */}
            <div
              className={`
                relative w-full rounded-2xl border-2 transition-[border-color,background-color,box-shadow] duration-300
                ${flipped
                  ? 'border-success/30 bg-success/10'
                  : 'border-primary/20 bg-base-100 cursor-pointer hover:border-primary/30 hover:shadow-md'
                }
              `}
              style={{ minHeight: '200px' }}
            >
              {/* Front: question */}
              {!flipped && (
                <div className="flex flex-col items-center justify-center p-6 min-h-[200px] gap-4">
                  <Text size="lg" className="text-base-content text-center leading-relaxed">
                    {currentItem.questionText}
                  </Text>
                  <Button
                    color="primary"
                    onClick={handleFlip}
                  >
                    Mostrar respuesta
                  </Button>
                  {latestAttempt && (
                    <Text size="xs" className="text-base-content/40">
                      Repasado {latestAttempt.repetitions || 0} vez
                      {latestAttempt.repetitions !== 1 ? 'ces' : ''}
                    </Text>
                  )}
                </div>
              )}

              {/* Back: question + score selector */}
              {flipped && (
                <div className="flex flex-col p-6 gap-4">
                  <Text size="lg" className="text-base-content text-center leading-relaxed">
                    {currentItem.questionText}
                  </Text>
                  <ScoreSelector
                    onSelect={handleScore}
                    disabled={scoring}
                  />
                  {scoring && (
                    <div className="flex items-center justify-center gap-2 text-sm text-base-content/50">
                      <div className="w-4 h-4 border-2 border-base-300 border-t-primary rounded-full animate-spin" />
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
                className="text-xs text-primary hover:opacity-80 self-center font-medium"
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

  return <span className="text-base-content/70 font-medium">{title}</span>;
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
      <Text size="xs" className="text-base-content/40 italic text-center py-2">
        Sin historial — este será el primer repaso.
      </Text>
    );
  }

  return (
    <div className="bg-base-100 border border-base-content/10 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-base-200 border-b border-base-content/10">
        <Text size="xs" className="font-semibold text-base-content/70">
          Historial ({history.length} repaso{history.length !== 1 ? 's' : ''})
        </Text>
      </div>
      <ul className="divide-y divide-base-content/10">
        {history.map((attempt, idx) => (
          <li
            key={attempt.id || idx}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <span className="text-base flex-shrink-0">
              <ScoreIcon score={attempt.score} size={20} />
            </span>
            <div className="flex-1 min-w-0">
              <Text size="xs" className="font-medium text-base-content">
                {scoreLabel(attempt.score)}
              </Text>
              <Text size="xs" className="text-base-content/40">
                {formatRelative(attempt.reviewedAt)}
                {attempt.interval > 0 && (
                  <> · Próximo en {attempt.interval} día{attempt.interval !== 1 ? 's' : ''}</>
                )}
                {attempt.repetitions > 0 && (
                  <> · {attempt.repetitions} repeticion{attempt.repetitions !== 1 ? 'es' : ''}</>
                )}
              </Text>
            </div>
            {/* Interval badge */}
            {attempt.interval > 0 && (
              <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary">
                +{attempt.interval}d
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
