/**
 * SM-2 Spaced Repetition Algorithm — SaberAbierto
 *
 * Client-side implementation of the SuperMemo 2 algorithm with two
 * difficulty multipliers for better granularity (score 2 vs 3).
 *
 * @module services/sm2
 */

/**
 * Add days to a date (returns a new Date).
 *
 * @param {Date}   date
 * @param {number} days
 * @returns {Date}
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calculate the next review interval and date using SM-2.
 *
 * Score meanings (per design):
 *   0 — "Olvidé" (forgot):        reset to interval=1, repetitions=0
 *   1 — "Parcial" (partial):      same interval, no repetition increment
 *   2 — "Correcto con esfuerzo":  interval × 2
 *   3 — "Perfecto":               interval × 2.5
 *
 * Interval progression for new items:
 *   repetitions=0 → 1 day
 *   repetitions=1 → 4 days
 *   repetitions≥2 → previousInterval × multiplier (capped at 180 days / 6 months)
 *
 * @param {0|1|2|3} score              — User's recall quality
 * @param {number}   repetitions        — Previous repetition count
 * @param {number}   previousInterval   — Previous interval in days
 * @returns {{ interval: number, nextReviewDate: Date, repetitions: number }}
 *
 * @example
 *   // First review, perfect recall → interval = 1, next in 1 day
 *   calculateNextReview(3, 0, 0);
 *
 *   // Fourth review, correct with effort, previous interval was 16 days
 *   calculateNextReview(2, 3, 16);
 */
export function calculateNextReview(score, repetitions = 0, previousInterval = 0) {
  // Score 0 ("forgot"): reset completely
  if (score === 0) {
    return {
      interval: 1,
      nextReviewDate: addDays(new Date(), 1),
      repetitions: 0,
    };
  }

  // Score 1 ("partial"): keep same interval, no repetition increment
  if (score === 1) {
    const interval = previousInterval || 1;
    return {
      interval,
      nextReviewDate: addDays(new Date(), interval),
      repetitions,
    };
  }

  // Score 2 or 3: progress the item
  const multiplier = score === 3 ? 2.5 : 2;
  const newReps = repetitions + 1;

  let interval;
  if (repetitions === 0) {
    interval = 1;
  } else if (repetitions === 1) {
    interval = 4;
  } else {
    interval = Math.min(Math.round(previousInterval * multiplier), 180);
  }

  return {
    interval,
    nextReviewDate: addDays(new Date(), interval),
    repetitions: newReps,
  };
}

export { addDays };
