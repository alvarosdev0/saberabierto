import { useState, useEffect } from 'react';
import { Text } from '@ninna-ui/primitives';
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
      <div className="bg-base-100 rounded-xl border border-base-content/10 p-4 animate-pulse">
        <div className="h-3 w-32 bg-base-content/10 rounded mb-2" />
        <div className="h-5 w-40 bg-base-content/10 rounded" />
      </div>
    );
  }

  if (!nextReview) {
    return (
      <div className="bg-base-100 rounded-xl border border-base-content/10 p-4">
        <Text size="xs" className="text-base-content/50 font-medium uppercase tracking-wide mb-1">
          Próximo repaso
        </Text>
        <Text size="sm" className="text-base-content/40 italic">
          No hay repasos programados. Crea un cuestionario para empezar.
        </Text>
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
    accentClass = 'text-danger';
  } else if (diffDays === 0) {
    label = 'Hoy';
    accentClass = 'text-warning';
  } else if (diffDays === 1) {
    label = 'Mañana';
    accentClass = 'text-success';
  } else if (diffDays <= 7) {
    label = `En ${diffDays} días`;
    accentClass = 'text-success';
  } else if (diffDays <= 30) {
    label = `En ${diffDays} días`;
    accentClass = 'text-base-content/70';
  } else {
    label = nr.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    accentClass = 'text-base-content/70';
  }

  return (
    <div className="bg-base-100 rounded-xl border border-base-content/10 p-4">
      <Text size="xs" className="text-base-content/50 font-medium uppercase tracking-wide mb-1">
        Próximo repaso
      </Text>
      <p className={`text-base font-bold ${accentClass}`}>
        {label}
      </p>
    </div>
  );
}
