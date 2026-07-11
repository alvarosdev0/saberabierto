import { useState, useEffect } from 'react';
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
          // Total answered questions (answered = true)
          db.questions.where('answered').equals(1).count(),

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
          <div key={i} className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default p-4 animate-pulse">
            <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-6 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-xs text-gray-400 italic">No hay estadísticas aún.</p>
    );
  }

  const cards = [
    { label: 'Respondidas', value: stats.totalAnswered, emoji: '✏️' },
    { label: 'Repasos', value: stats.reviewsDone, emoji: '🔄' },
    { label: 'Racha', value: `${stats.streak} día${stats.streak !== 1 ? 's' : ''}`, emoji: '🔥' },
    { label: 'Pendientes', value: stats.dueCount, emoji: stats.dueCount > 0 ? '📬' : '✅' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default p-3 transition-shadow hover:shadow-sm"
        >
          <p className="text-[11px] text-gray-500 dark:text-muted font-medium uppercase tracking-wide mb-1">
            {card.label}
          </p>
          <p className="text-lg font-bold text-gray-800 dark:text-foreground flex items-center gap-1.5">
            <span className="text-sm">{card.emoji}</span>
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
