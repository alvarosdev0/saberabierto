import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
        <h1 className="text-2xl font-bold text-purple-900 font-heading">
          SaberAbierto
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Tu espacio de estudio con repaso espaciado
        </p>
      </header>

      {/* ── Reviews Due Banner ────────────────────────────────────────── */}
      <ReviewsDueBanner />

      {/* ── Active Session Card ───────────────────────────────────────── */}
      {!sessionLoading && activeSession && (
        <section className="bg-white dark:bg-surface rounded-2xl border border-purple-200 dark:border-default p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-xs text-purple-500 font-medium uppercase tracking-wide mb-1">
                Sesión activa
              </p>
              <h2 className="text-lg font-bold text-purple-900 font-heading truncate">
                {activeSession.subject}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Iniciada el {formatDate(activeSession.createdAt)}
              </p>
            </div>
            {/* Badge: completion */}
            {totalCount > 0 && (
              <span className="flex-shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
                {completedCount}/{totalCount}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>Progreso</span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-[width] duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Continue button */}
          <button
            type="button"
            onClick={handleContinue}
            className="w-full py-3 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm flex items-center justify-center gap-2"
            style={{ minHeight: 'var(--touch-target-min)' }}
          >
            <span>▶</span>
            <span>
              {sessionSections.some((s) => s.status === 'pending')
                ? 'Continuar'
                : 'Ir al cuestionario'}
            </span>
          </button>
        </section>
      )}

      {/* Empty state — no active session */}
      {!sessionLoading && !activeSession && (
        <section className="bg-white dark:bg-surface rounded-2xl border border-gray-200 dark:border-default p-6 text-center shadow-sm">
          <span className="text-4xl mb-3 block">📚</span>
          <h2 className="text-lg font-bold text-gray-700 dark:text-foreground mb-2 font-heading">
            Sin sesión activa
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mb-5">
            Sube un PDF para comenzar una nueva sesión de estudio con lectura
            interrogativa, brain dump y repaso espaciado.
          </p>
          <button
            type="button"
            onClick={handleNewSession}
            className="px-6 py-3 text-sm font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm"
            style={{ minHeight: 'var(--touch-target-min)' }}
          >
            Nueva sesión
          </button>
        </section>
      )}

      {/* ── Quick Stats ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-muted uppercase tracking-wide mb-3">
          Estadísticas
        </h2>
        <QuickStats />
      </section>

      {/* ── Next Review Countdown ──────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-muted uppercase tracking-wide mb-3">
          Repasos
        </h2>
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
        <h2 className="text-sm font-semibold text-gray-500 dark:text-muted uppercase tracking-wide mb-3">
          Lagunas de conocimiento
        </h2>
        <GapsToRevisit />
      </section>

      {/* ── Session History ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-muted uppercase tracking-wide mb-3">
          Historial de sesiones
        </h2>

        {historyLoading && (
          <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default p-4 animate-pulse">
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        )}

        {!historyLoading && pastSessions.length === 0 && (
          <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default p-4 text-center">
            <p className="text-sm text-gray-400 italic">
              No hay sesiones anteriores. ¡Comienza tu primera sesión!
            </p>
          </div>
        )}

        {!historyLoading && pastSessions.length > 0 && (
          <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default divide-y divide-gray-100">
            {pastSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-foreground truncate">
                    {session.subject}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(session.createdAt)}
                    {session.updatedAt !== session.createdAt && (
                      <> · Actualizada {formatDate(session.updatedAt)}</>
                    )}
                  </p>
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
