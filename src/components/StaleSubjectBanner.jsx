import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Text } from '@ninna-ui/primitives';
import db from '../services/db.js';

/**
 * StaleSubjectBanner — 3-month rule reminder.
 *
 * Per design §Mobile UX Requirements:
 *   If >90 days have elapsed since the last session for a subject
 *   (queried via sessions compound index [subject+updatedAt]),
 *   show this banner allowing the user to review their brain dump
 *   notes before answering spaced-retrieval questions.
 *
 * This is a UX relaxation (notes review before recall), not an
 * SM-2 override — the algorithm's interval computation is unchanged.
 *
 * @param {object} props
 * @param {number} props.sessionId — The session ID to check staleness for
 */
export default function StaleSubjectBanner({ sessionId }) {
  const navigate = useNavigate();
  const [stale, setStale] = useState(false);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const sess = await db.sessions.get(Number(sessionId));
        if (cancelled) return;
        if (!sess) {
          setLoading(false);
          return;
        }
        setSession(sess);

        // Check staleness using the [subject+updatedAt] compound index
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const recentCount = await db.sessions
          .where('[subject+updatedAt]')
          .between(
            [sess.subject, ninetyDaysAgo],
            [sess.subject, new Date()],
            true,
            true,
          )
          .count();

        if (cancelled) return;
        setStale(recentCount === 0);
      } catch (err) {
        console.warn('Error checking staleness:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    check();
    return () => { cancelled = true; };
  }, [sessionId]);

  const handleReviewNotes = useCallback(() => {
    if (!session) return;
    // Navigate to the first section's brain dump for notes review
    navigate(`/session/${session.id}/section/1/brain-dump`);
  }, [session, navigate]);

  if (loading || !stale) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 bg-warning/10 border border-warning/30 rounded-xl"
      role="alert"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">⏰</span>
        <div>
          <Text size="sm" className="font-semibold text-warning">
            Más de 3 meses sin repasar
          </Text>
          <Text size="xs" className="text-warning/70 mt-0.5">
            {session?.subject
              ? `No has estudiado "${session.subject}" en los últimos 90 días.`
              : 'No has estudiado este tema en los últimos 90 días.'}
          </Text>
        </div>
      </div>
      <button
        type="button"
        onClick={handleReviewNotes}
        className="flex-shrink-0 px-3 py-2 text-xs font-semibold rounded-lg bg-warning text-warning-content hover:opacity-90 transition-colors"
        style={{ minHeight: 'var(--touch-target-min)' }}
      >
        Repasar notas
      </button>
    </div>
  );
}
