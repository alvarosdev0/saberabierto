import { useState, useEffect } from 'react';
import { Pencil, RefreshCw, Zap, CheckCircle, MailOpen } from 'lucide-react';
import { Text } from '@ninna-ui/primitives';
import db from '../services/db.js';

/**
 * QuickStats — dashboard stat cards.
 *
 * Per design §HomeDashboard:
 *   Total answered, reviews done, streak (consecutive study days),
 *   and due-review badge count.
 *
 * Props are lazy-loaded from Dexie on mount.
 */
export default function QuickStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [totalAnswered, reviewsDone, dueCount, streak] = await Promise.all([
          // Total answered questions (answered = true) — filter in memory, not indexed
          db.questions.toArray().then((all) => all.filter((q) => q.answered).length),

          // Total reviews done
          db.reviewAttempts.count(),

          // Due review count
          countDueNow(),

          // Consecutive study-day streak
          computeStreak(),
        ]);

        if (!cancelled) {
          setStats({ totalAnswered, reviewsDone, dueCount, streak });
        }
      } catch (err) {
        console.warn('QuickStats load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-base-100 rounded-xl border border-base-content/10 p-4 animate-pulse">
            <div className="h-3 w-16 bg-base-content/10 rounded mb-2" />
            <div className="h-6 w-10 bg-base-content/10 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <Text size="xs" className="text-base-content/40 italic">No hay estadísticas aún.</Text>
    );
  }

  const cards = [
    { label: 'Respondidas', value: stats.totalAnswered, icon: Pencil },
    { label: 'Repasos', value: stats.reviewsDone, icon: RefreshCw },
    { label: 'Racha', value: `${stats.streak} día${stats.streak !== 1 ? 's' : ''}`, icon: Zap },
    { label: 'Pendientes', value: stats.dueCount, icon: stats.dueCount > 0 ? MailOpen : CheckCircle },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-base-100 rounded-xl border border-base-content/10 p-3 transition-shadow hover:shadow-sm"
        >
          <Text size="xs" className="text-base-content/50 font-medium uppercase tracking-wide mb-1">
            {card.label}
          </Text>
          <p className="text-lg font-bold text-base-content flex items-center gap-1.5">
            <card.icon size={16} aria-hidden="true" />
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Count items whose latest review is due today or earlier. */
async function countDueNow() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items = await db.questionnaireItems.toArray();
    if (items.length === 0) return 0;

    let due = 0;
    for (const item of items) {
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
    return due;
  } catch {
    return 0;
  }
}

/** Compute the current consecutive-day study streak. */
async function computeStreak() {
  try {
    // Gather all activity dates: session updates + review attempts
    const dates = new Set();

    const sessions = await db.sessions.toArray();
    sessions.forEach((s) => {
      if (s.updatedAt) dates.add(toDateKey(s.updatedAt));
      if (s.createdAt) dates.add(toDateKey(s.createdAt));
    });

    const attempts = await db.reviewAttempts.toArray();
    attempts.forEach((a) => {
      if (a.reviewedAt) dates.add(toDateKey(a.reviewedAt));
    });

    if (dates.size === 0) return 0;

    // Walk backwards from today counting consecutive days
    const today = toDateKey(new Date());
    let streak = 0;
    const cursor = new Date();

    // If no activity today, streak is 0 unless yesterday has activity
    if (!dates.has(today)) {
      // Check if yesterday had activity
      cursor.setDate(cursor.getDate() - 1);
      if (!dates.has(toDateKey(cursor))) return 0;
    }

    // Count consecutive days going backwards
    while (dates.has(toDateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  } catch {
    return 0;
  }
}

/** Convert a Date or ISO string to 'YYYY-MM-DD' key. */
function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
