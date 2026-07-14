import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, BookOpen } from 'lucide-react';
import { Button, Heading, Text } from '@ninna-ui/primitives';
import { Progress } from '@ninna-ui/feedback';
import { Card } from '@ninna-ui/data-display';
import db from '../services/db.js';
import QuickStats from '../components/QuickStats.jsx';
import ReviewCountdown from '../components/ReviewCountdown.jsx';
import ReviewsDueBanner from '../components/ReviewsDueBanner.jsx';
import GapsToRevisit from '../components/GapsToRevisit.jsx';

/**
 * HomeDashboard — landing page with session overview, stats, and review status.
 *
 * Per design §HomeDashboard / §Component Tree:
 *   SubjectCard (active session + progress + "Continuar")
 *   QuickStats, ReviewCountdown, ReviewsDueBanner, GapsToRevisit
 *   Session history (past sessions list)
 *
 * Route: /
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusLabel(status) {
  switch (status) {
    case 'active': return 'Activa';
    case 'completed': return 'Completada';
    case 'abandoned': return 'Abandonada';
    default: return status || '—';
  }
}

function statusColor(status) {
  switch (status) {
    case 'active': return 'bg-emerald-100 text-emerald-700';
    case 'completed': return 'bg-purple-100 text-purple-700';
    case 'abandoned': return 'bg-gray-100 text-gray-500';
    default: return 'bg-gray-100 text-gray-500';
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate();

  // ── Active session state ─────────────────────────────────────────────────
  const [activeSession, setActiveSession] = useState(null);
  const [sessionSections, setSessionSections] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(true);

  // ── Session history state ────────────────────────────────────────────────
  const [pastSessions, setPastSessions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ── Load active session + sections ──────────────────────────────────────
  const loadActiveSession = useCallback(async () => {
    try {
      const active = await db.sessions
        .where('status')
        .equals('active')
        .first();

      if (active) {
        const sections = await db.sections
          .where('sessionId')
          .equals(active.id)
          .sortBy('order');

        setActiveSession(active);
        setSessionSections(sections);
      } else {
        setActiveSession(null);
        setSessionSections([]);
      }
    } catch (err) {
      console.warn('Home: loadActiveSession error:', err);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  // ── Load session history ────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const all = await db.sessions
        .orderBy('updatedAt')
        .reverse()
        .toArray();

      // Exclude active session from history
      const past = all.filter((s) => s.status !== 'active');
      setPastSessions(past);
    } catch (err) {
      console.warn('Home: loadHistory error:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveSession();
    loadHistory();
  }, [loadActiveSession, loadHistory]);

  // ── Navigate to next pending section ────────────────────────────────────
  const handleContinue = useCallback(() => {
    const nextSection = sessionSections.find((s) => s.status === 'pending');
    if (nextSection) {
      navigate(
        `/session/${activeSession.id}/section/${nextSection.id}/read`,
      );
    } else if (activeSession) {
      // All sections done — go to questionnaire builder
      navigate(`/session/${activeSession.id}/questionnaire`);
    }
  }, [activeSession, sessionSections, navigate]);

  // ── Start new session ───────────────────────────────────────────────────
  const handleNewSession = useCallback(() => {
    navigate('/upload');
  }, [navigate]);

  // ── Section progress ─────────────────────────────────────────────────────
  const completedCount = sessionSections.filter((s) => s.status === 'completed').length;
  const totalCount = sessionSections.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 p-4 max-w-2xl mx-auto pb-24">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="pt-2">
        <Heading as="h1" size="2xl" className="text-purple-900 font-heading">
          SaberAbierto
        </Heading>
        <Text size="sm" className="text-base-content/50 mt-1">
          Tu espacio de estudio con repaso espaciado
        </Text>
      </header>

      {/* ── Reviews Due Banner ────────────────────────────────────────── */}
      <ReviewsDueBanner />

      {/* ── Active Session Card ───────────────────────────────────────── */}
      {!sessionLoading && activeSession && (
        <Card>
          <Card.Header>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Text size="xs" className="text-purple-500 font-medium uppercase tracking-wide">
                  Sesión activa
                </Text>
                <Heading as="h2" size="lg" className="text-purple-900 font-heading truncate">
                  {activeSession.subject}
                </Heading>
                <Text size="xs" className="text-base-content/40 mt-0.5">
                  Iniciada el {formatDate(activeSession.createdAt)}
                </Text>
              </div>
              {/* Badge: completion */}
              {totalCount > 0 && (
                <span className="flex-shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
                  {completedCount}/{totalCount}
                </span>
              )}
            </div>
          </Card.Header>

          <Card.Body>
            {/* Progress bar */}
            {totalCount > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-base-content/40 mb-1">
                  <span>Progreso</span>
                  <span>{progressPct}%</span>
                </div>
                <Progress color="primary" value={progressPct} />
              </div>
            )}

            {/* Continue button */}
            <Button
              color="primary"
              className="w-full"
              onClick={handleContinue}
            >
              <Play size={18} aria-hidden="true" />
              {sessionSections.some((s) => s.status === 'pending')
                ? 'Continuar'
                : 'Ir al cuestionario'}
            </Button>
          </Card.Body>
        </Card>
      )}

      {/* Empty state — no active session */}
      {!sessionLoading && !activeSession && (
        <Card className="text-center">
          <Card.Body>
            <BookOpen size={40} aria-hidden="true" className="text-base-content/20 mx-auto mb-3" />
            <Heading as="h2" size="lg" className="text-base-content mb-2 font-heading">
              Sin sesión activa
            </Heading>
            <Text size="sm" className="text-base-content/50 mb-5">
              Sube un PDF para comenzar una nueva sesión de estudio con lectura
              interrogativa, descarga de ideas y repaso espaciado.
            </Text>
            <Button
              color="primary"
              onClick={handleNewSession}
            >
              Nueva sesión
            </Button>
          </Card.Body>
        </Card>
      )}

      {/* ── Quick Stats ────────────────────────────────────────────────── */}
      <section>
        <Heading as="h2" size="sm" className="text-base-content/50 uppercase tracking-wide mb-3">
          Estadísticas
        </Heading>
        <QuickStats />
      </section>

      {/* ── Next Review Countdown ──────────────────────────────────────── */}
      <section>
        <Heading as="h2" size="sm" className="text-base-content/50 uppercase tracking-wide mb-3">
          Repasos
        </Heading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ReviewCountdown />
          <button
            type="button"
            onClick={() => navigate('/review')}
            className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default p-4 text-left hover:border-purple-200 hover:shadow-sm transition-[border-color,box-shadow]"
            style={{ minHeight: 'var(--touch-target-min)' }}
          >
            <p className="text-xs text-gray-500 dark:text-muted font-medium uppercase tracking-wide mb-1">
              Repaso espaciado
            </p>
            <p className="text-sm font-semibold text-purple-600">
              Ir a repasar →
            </p>
          </button>
        </div>
      </section>

      {/* ── Gaps to Revisit ────────────────────────────────────────────── */}
      <section>
        <Heading as="h2" size="sm" className="text-base-content/50 uppercase tracking-wide mb-3">
          Lagunas de conocimiento
        </Heading>
        <GapsToRevisit />
      </section>

      {/* ── Session History ────────────────────────────────────────────── */}
      <section>
        <Heading as="h2" size="sm" className="text-base-content/50 uppercase tracking-wide mb-3">
          Historial de sesiones
        </Heading>

        {historyLoading && (
          <div className="bg-base-100 rounded-xl border border-base-content/10 p-4 animate-pulse">
            <div className="h-4 w-full bg-base-content/10 rounded mb-2" />
            <div className="h-4 w-3/4 bg-base-content/10 rounded" />
          </div>
        )}

        {!historyLoading && pastSessions.length === 0 && (
          <div className="bg-base-100 rounded-xl border border-base-content/10 p-4 text-center">
            <Text size="sm" className="text-base-content/30 italic">
              No hay sesiones anteriores. ¡Comienza tu primera sesión!
            </Text>
          </div>
        )}

        {!historyLoading && pastSessions.length > 0 && (
          <div className="bg-base-100 rounded-xl border border-base-content/10 divide-y divide-base-content/10">
            {pastSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <Text size="sm" className="font-medium text-base-content truncate">
                    {session.subject}
                  </Text>
                  <Text size="xs" className="text-base-content/40 mt-0.5">
                    {formatDate(session.createdAt)}
                    {session.updatedAt !== session.createdAt && (
                      <> · Actualizada {formatDate(session.updatedAt)}</>
                    )}
                  </Text>
                </div>
                <span
                  className={`flex-shrink-0 px-2 py-0.5 text-[11px] font-medium rounded-full ${statusColor(session.status)}`}
                >
                  {statusLabel(session.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
