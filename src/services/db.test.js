/**
 * Dexie Query Helper Tests — SaberAbierto
 *
 * Tests database operations: session filtering, due reviews, gap queries.
 * Uses fake-indexeddb to polyfill IndexedDB in jsdom.
 *
 * NOTE: fake-indexeddb must be imported before Dexie initializes the database.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import db from './db.js';

// Re-initialize db for each test (fake-indexeddb needs fresh state)
beforeAll(async () => {
  // Open the database
  await db.open();
});

afterEach(async () => {
  // Clear all tables between tests
  await db.sessions.clear();
  await db.sections.clear();
  await db.notes.clear();
  await db.questions.clear();
  await db.questionnaires.clear();
  await db.questionnaireItems.clear();
  await db.reviewAttempts.clear();
  await db.pdfCache.clear();
  await db.settings.clear();
});

// ─── SESSION FILTERING ─────────────────────────────────────────────────────

describe('session queries', () => {
  it('creates and retrieves a session', async () => {
    const id = await db.sessions.add({
      subject: 'Biología',
      status: 'active',
      createdAt: new Date('2026-07-01'),
      updatedAt: new Date('2026-07-10'),
    });

    const session = await db.sessions.get(id);
    expect(session).toBeDefined();
    expect(session.subject).toBe('Biología');
    expect(session.status).toBe('active');
  });

  it('queries sessions by status', async () => {
    await db.sessions.bulkAdd([
      { subject: 'Biología', status: 'active', createdAt: new Date(), updatedAt: new Date() },
      { subject: 'Historia', status: 'completed', createdAt: new Date(), updatedAt: new Date() },
      { subject: 'Matemáticas', status: 'abandoned', createdAt: new Date(), updatedAt: new Date() },
    ]);

    const active = await db.sessions.where('status').equals('active').toArray();
    expect(active).toHaveLength(1);
    expect(active[0].subject).toBe('Biología');
  });

  it('retrieves the most recently updated session', async () => {
    await db.sessions.bulkAdd([
      { subject: 'A', status: 'completed', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-06-01') },
      { subject: 'B', status: 'completed', createdAt: new Date('2026-02-01'), updatedAt: new Date('2026-07-01') },
    ]);

    const recent = await db.sessions.orderBy('updatedAt').reverse().first();
    expect(recent.subject).toBe('B');
  });

  it('queries by compound index [subject+updatedAt]', async () => {
    const date1 = new Date('2026-07-01');
    const date2 = new Date('2026-07-15');
    const date3 = new Date('2026-08-01');

    await db.sessions.bulkAdd([
      { subject: 'Biología', status: 'completed', createdAt: date1, updatedAt: date1 },
      { subject: 'Biología', status: 'completed', createdAt: date2, updatedAt: date2 },
      { subject: 'Historia', status: 'completed', createdAt: date3, updatedAt: date3 },
    ]);

    // Query Biología sessions between July 1 and July 31
    const biologias = await db.sessions
      .where('[subject+updatedAt]')
      .between(
        ['Biología', new Date('2026-07-01')],
        ['Biología', new Date('2026-07-31')],
        true,
        true,
      )
      .toArray();

    expect(biologias).toHaveLength(2);
    biologias.forEach((s) => expect(s.subject).toBe('Biología'));
  });
});

// ─── DUE REVIEWS ───────────────────────────────────────────────────────────

describe('due review queries', () => {
  it('finds review attempts due today or earlier', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const today = new Date();

    await db.reviewAttempts.bulkAdd([
      { questionnaireItemId: 1, sessionId: 1, score: 2, repetitions: 1, interval: 4,
        reviewedAt: new Date('2026-07-06'), nextReview: yesterday },
      { questionnaireItemId: 2, sessionId: 1, score: 3, repetitions: 2, interval: 8,
        reviewedAt: new Date('2026-07-08'), nextReview: today },
      { questionnaireItemId: 3, sessionId: 1, score: 2, repetitions: 0, interval: 1,
        reviewedAt: new Date('2026-07-09'), nextReview: tomorrow },
    ]);

    // Due reviews: nextReview <= today
    const due = await db.reviewAttempts
      .where('nextReview')
      .belowOrEqual(today)
      .toArray();

    expect(due).toHaveLength(2); // yesterday + today
  });

  it('stores and retrieves review attempt with all fields', async () => {
    const id = await db.reviewAttempts.add({
      questionnaireItemId: 42,
      sessionId: 10,
      score: 3,
      repetitions: 2,
      interval: 8,
      reviewedAt: new Date('2026-07-08'),
      nextReview: new Date('2026-07-16'),
    });

    const attempt = await db.reviewAttempts.get(id);
    expect(attempt.questionnaireItemId).toBe(42);
    expect(attempt.score).toBe(3);
    expect(attempt.interval).toBe(8);
  });
});

// ─── GAP QUERIES ───────────────────────────────────────────────────────────

describe('gap queries', () => {
  it('queries notes with hasGaps index', async () => {
    await db.notes.bulkAdd([
      { sectionId: 1, hasGaps: 1, status: 'final', createdAt: new Date() },
      { sectionId: 1, hasGaps: 0, status: 'final', createdAt: new Date() },
      { sectionId: 2, hasGaps: 1, status: 'final', createdAt: new Date() },
    ]);

    const gapped = await db.notes.where('hasGaps').equals(1).toArray();
    expect(gapped).toHaveLength(2);
  });

  it('returns empty array when no gaps exist', async () => {
    await db.notes.add({ sectionId: 1, hasGaps: 0, status: 'final', createdAt: new Date() });

    const gapped = await db.notes.where('hasGaps').equals(1).toArray();
    expect(gapped).toHaveLength(0);
  });
});

// ─── TABLE STRUCTURE VERIFICATION ──────────────────────────────────────────

describe('table structure', () => {
  it('has all 9 tables defined', async () => {
    const tables = db.tables.map((t) => t.name);
    expect(tables).toContain('sessions');
    expect(tables).toContain('sections');
    expect(tables).toContain('notes');
    expect(tables).toContain('questions');
    expect(tables).toContain('questionnaires');
    expect(tables).toContain('questionnaireItems');
    expect(tables).toContain('reviewAttempts');
    expect(tables).toContain('pdfCache');
    expect(tables).toContain('settings');
  });
});

// ─── CONCURRENT WRITES ─────────────────────────────────────────────────────

describe('concurrent writes', () => {
  it('handles multiple concurrent additions', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      db.sessions.add({
        subject: `Subject ${i}`,
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const ids = await Promise.all(promises);
    expect(ids).toHaveLength(10);

    const all = await db.sessions.toArray();
    expect(all).toHaveLength(10);
  });

  it('handles concurrent reads and writes', async () => {
    // Write some data
    await db.sessions.bulkAdd(
      Array.from({ length: 5 }, (_, i) => ({
        subject: `S${i}`,
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );

    // Concurrent read + write
    const [readResult] = await Promise.all([
      db.sessions.where('status').equals('completed').toArray(),
      db.sessions.add({
        subject: 'New',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ]);

    expect(readResult).toHaveLength(5);
    const all = await db.sessions.toArray();
    expect(all).toHaveLength(6);
  });
});

// ─── SETTINGS TABLE ────────────────────────────────────────────────────────

describe('settings table', () => {
  it('stores key-value settings', async () => {
    await db.settings.put({ key: 'provider', value: 'deepseek' });
    const setting = await db.settings.get('provider');
    expect(setting.value).toBe('deepseek');
  });

  it('updates existing setting', async () => {
    await db.settings.put({ key: 'theme', value: 'light' });
    await db.settings.put({ key: 'theme', value: 'dark' });

    const setting = await db.settings.get('theme');
    expect(setting.value).toBe('dark');
  });
});
