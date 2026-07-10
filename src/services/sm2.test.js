/**
 * SM-2 Algorithm Unit Tests — SaberAbierto
 *
 * Tests all score paths and edge cases per design §SM-2 Algorithm.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateNextReview, addDays } from './sm2.js';

describe('addDays', () => {
  it('adds days to a date correctly', () => {
    // Use explicit UTC to avoid timezone issues in jsdom
    const base = new Date(Date.UTC(2026, 0, 1)); // Jan 1, 2026 UTC
    const result = addDays(base, 5);
    expect(result.getUTCDate()).toBe(6);
    expect(result.getUTCMonth()).toBe(0); // January
  });

  it('handles month boundaries', () => {
    const base = new Date(Date.UTC(2026, 0, 31)); // Jan 31 UTC
    const result = addDays(base, 1);
    expect(result.getUTCDate()).toBe(1);
    expect(result.getUTCMonth()).toBe(1); // February
  });

  it('returns a new Date object (does not mutate original)', () => {
    const original = new Date(Date.UTC(2026, 0, 1));
    const result = addDays(original, 10);
    expect(original.getUTCDate()).toBe(1);
    expect(result.getUTCDate()).toBe(11);
  });
});

describe('calculateNextReview', () => {
  let today;

  beforeEach(() => {
    // Freeze "today" to a known date for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
    today = new Date();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── SCORE 0: FORGOT → RESET ─────────────────────────────────────────────

  describe('score 0 (forgot) — reset', () => {
    it('resets interval to 1 and repetitions to 0', () => {
      const result = calculateNextReview(0, 5, 16);
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(0);
    });

    it('sets nextReviewDate to tomorrow', () => {
      const result = calculateNextReview(0, 3, 8);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(result.nextReviewDate.toDateString()).toBe(tomorrow.toDateString());
    });

    it('works even with 0 previous repetitions', () => {
      const result = calculateNextReview(0, 0, 0);
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(0);
    });
  });

  // ─── SCORE 1: PARTIAL → SAME INTERVAL ────────────────────────────────────

  describe('score 1 (partial) — same interval', () => {
    it('keeps the same interval', () => {
      const result = calculateNextReview(1, 3, 8);
      expect(result.interval).toBe(8);
    });

    it('does not increment repetitions', () => {
      const result = calculateNextReview(1, 3, 8);
      expect(result.repetitions).toBe(3);
    });

    it('defaults to interval 1 when previousInterval is 0', () => {
      const result = calculateNextReview(1, 0, 0);
      expect(result.interval).toBe(1);
    });

    it('sets nextReviewDate correctly', () => {
      const result = calculateNextReview(1, 2, 6);
      const expected = new Date(today);
      expected.setDate(expected.getDate() + 6);
      expect(result.nextReviewDate.toDateString()).toBe(expected.toDateString());
    });
  });

  // ─── SCORE 2: CORRECT WITH EFFORT → ×2 ───────────────────────────────────

  describe('score 2 (correct with effort) — interval × 2', () => {
    it('returns interval = 1 when repetitions = 0', () => {
      const result = calculateNextReview(2, 0, 0);
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(1);
    });

    it('returns interval = 4 when repetitions = 1', () => {
      const result = calculateNextReview(2, 1, 1);
      expect(result.interval).toBe(4);
      expect(result.repetitions).toBe(2);
    });

    it('multiplies previous interval by 2 when repetitions ≥ 2', () => {
      const result = calculateNextReview(2, 2, 6);
      expect(result.interval).toBe(12);
      expect(result.repetitions).toBe(3);
    });

    it('progresses correctly through multiple reviews', () => {
      // rep=0 → 1, rep=1 → 4, rep=2 ÷ 4×2=8
      const r1 = calculateNextReview(2, 0, 0);
      expect(r1.interval).toBe(1);
      expect(r1.repetitions).toBe(1);

      const r2 = calculateNextReview(2, r1.repetitions, r1.interval);
      expect(r2.interval).toBe(4);
      expect(r2.repetitions).toBe(2);

      const r3 = calculateNextReview(2, r2.repetitions, r2.interval);
      expect(r3.interval).toBe(8);
      expect(r3.repetitions).toBe(3);
    });

    it('caps at 180 days (6 months)', () => {
      // Start with interval 90, score 2 → 90×2=180 (at cap)
      const result = calculateNextReview(2, 5, 90);
      expect(result.interval).toBe(180);
    });

    it('caps at 180 when multiplier would exceed', () => {
      const result = calculateNextReview(2, 5, 120);
      // 120×2=240 → capped at 180
      expect(result.interval).toBe(180);
    });
  });

  // ─── SCORE 3: PERFECT → ×2.5 ─────────────────────────────────────────────

  describe('score 3 (perfect) — interval × 2.5', () => {
    it('returns interval = 1 when repetitions = 0', () => {
      const result = calculateNextReview(3, 0, 0);
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(1);
    });

    it('returns interval = 4 when repetitions = 1', () => {
      const result = calculateNextReview(3, 1, 1);
      expect(result.interval).toBe(4);
      expect(result.repetitions).toBe(2);
    });

    it('multiplies by 2.5 when repetitions ≥ 2', () => {
      const result = calculateNextReview(3, 2, 4);
      // 4 × 2.5 = 10, Math.round → 10
      expect(result.interval).toBe(10);
      expect(result.repetitions).toBe(3);
    });

    it('rounds the interval', () => {
      // 5 × 2.5 = 12.5 → Math.round → 13
      const result = calculateNextReview(3, 3, 5);
      expect(result.interval).toBe(13);
    });

    it('progresses faster than score 2', () => {
      // Same starting point: score 3 gives larger intervals over time
      const r2 = calculateNextReview(2, 2, 8);
      const r3 = calculateNextReview(3, 2, 8);
      // 8×2=16 vs 8×2.5=20
      expect(r3.interval).toBeGreaterThan(r2.interval);
    });

    it('caps at 180 days', () => {
      const result = calculateNextReview(3, 5, 100);
      expect(result.interval).toBe(180);
    });
  });

  // ─── EDGE CASES ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles default parameters (repetitions=0, previousInterval=0)', () => {
      const result = calculateNextReview(2);
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(1);
    });

    it('handles very large previous interval with cap', () => {
      // Already at cap; score 2 on capped interval
      const result = calculateNextReview(2, 10, 180);
      expect(result.interval).toBe(180);
    });

    it('score 1 with high repetitions keeps same interval', () => {
      const result = calculateNextReview(1, 10, 120);
      expect(result.interval).toBe(120);
      expect(result.repetitions).toBe(10);
    });

    it('reset after score 0 clears high repetition count', () => {
      const result = calculateNextReview(0, 50, 180);
      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
    });

    it('nextReviewDate is a Date instance', () => {
      const result = calculateNextReview(2, 1, 4);
      expect(result.nextReviewDate).toBeInstanceOf(Date);
    });

    it('nextReviewDate is in the future for all scores', () => {
      for (const score of [0, 1, 2, 3]) {
        const result = calculateNextReview(score, 2, 6);
        expect(result.nextReviewDate.getTime()).toBeGreaterThanOrEqual(today.getTime());
      }
    });
  });
});
