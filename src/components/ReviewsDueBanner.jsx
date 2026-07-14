import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Text } from '@ninna-ui/primitives';
import db from '../services/db.js';

/**
 * ReviewsDueBanner — banner shown when reviews are overdue.
 *
 * Per design §HomeDashboard:
 *   Banner when reviews are overdue.
 *   Counts how many unique items are past due, shows a link to /review.
 *
 * Automatically hides when count reaches zero.
 */
export default function ReviewsDueBanner() {
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const items = await db.questionnaireItems.toArray();
        if (items.length === 0) {
          if (!cancelled) setDueCount(0);
          return;
        }

        let due = 0;
        for (const item of items) {
          if (cancelled) return;
          const latest = await db.reviewAttempts
            .where('questionnaireItemId')
            .equals(item.id)
            .reverse()
            .sortBy('reviewedAt');

          if (latest.length === 0) {
            due++;
          } else {
            const nextDate = new Date(latest[0].nextReview);
            if (nextDate <= today) due++;
          }
        }

        if (!cancelled) setDueCount(due);
      } catch (err) {
        console.warn('ReviewsDueBanner load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading || dueCount === 0) return null;

  return (
    <div
      className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center justify-between gap-3"
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg flex-shrink-0">⏰</span>
        <Text size="sm" className="text-warning">
          <span className="font-semibold">{dueCount}</span>{' '}
          repaso{dueCount !== 1 ? 's pendientes' : ' pendiente'}
        </Text>
      </div>
      <button
        type="button"
        onClick={() => navigate('/review')}
        className="flex-shrink-0 px-4 py-2 text-sm font-semibold rounded-lg bg-warning text-warning-content hover:opacity-90 transition-colors shadow-sm"
        style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
      >
        Repasar
      </button>
    </div>
  );
}
