import { useState, useEffect } from 'react';
import db from '../services/db.js';

/**
 * ReviewCountdown — shows the next upcoming review date in relative terms.
 *
 * Per design §HomeDashboard:
 *   Relative time display ("hoy", "en 2 días", "en 1 semana").
 *   Queries reviewAttempts by nextReview, picks the soonest after today.
 *
 * Falls back to the soonest ever if all are past-due, or shows a
 * "no hay repasos programados" message when there are no items at all.
 */
export default function ReviewCountdown() {
  const [nextReview, setNextReview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get all reviewAttempts sorted by nextReview ascending
        const allAttempts = await db.reviewAttempts
          .orderBy('nextReview')
          .toArray();

        if (cancelled || allAttempts.length === 0) {
          if (!cancelled) setNextReview(null);
          return;
        }

        // Find the soonest nextReview that is today or in the future
        let soonest = null;
        for (const a of allAttempts) {
          const nr = new Date(a.nextReview);
          if (nr >= today) {
            soonest = nr;
            break;
          }
        }

        // If all are past due, show the soonest past one as "overdue"
        if (!soonest && allAttempts.length > 0) {
          soonest = new Date(allAttempts[0].nextReview);
        }

        if (!cancelled) setNextReview(soonest);
      } catch (err) {
        console.warn('ReviewCountdown load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default p-4 animate-pulse">
        <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (!nextReview) {
    return (
      <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default p-4">
        <p className="text-xs text-gray-500 dark:text-muted font-medium uppercase tracking-wide mb-1">
          Próximo repaso
        </p>
        <p className="text-sm text-gray-400 italic">
          No hay repasos programados. Crea un cuestionario para empezar.
        </p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nr = new Date(nextReview);
  const diffMs = nr.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  let label;
  let accentClass;

  if (diffDays < 0) {
    label = `Vencido hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? 's' : ''}`;
    accentClass = 'text-red-600';
  } else if (diffDays === 0) {
    label = 'Hoy';
    accentClass = 'text-amber-600';
  } else if (diffDays === 1) {
    label = 'Mañana';
    accentClass = 'text-emerald-600';
  } else if (diffDays <= 7) {
    label = `En ${diffDays} días`;
    accentClass = 'text-emerald-600';
  } else if (diffDays <= 30) {
    label = `En ${diffDays} días`;
    accentClass = 'text-gray-600';
  } else {
    label = nr.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    accentClass = 'text-gray-600';
  }

  return (
    <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default p-4">
      <p className="text-xs text-gray-500 dark:text-muted font-medium uppercase tracking-wide mb-1">
        Próximo repaso
      </p>
      <p className={`text-base font-bold ${accentClass}`}>
        {label}
      </p>
    </div>
  );
}
