import Dexie from 'dexie';

/**
 * SaberAbierto — Dexie database schema (v1)
 *
 * All study data persists client-side via IndexedDB.
 * Tables: sessions, sections, notes, questions, questionnaires,
 *         questionnaireItems, reviewAttempts, pdfCache, settings
 */
const db = new Dexie('saberabierto');

db.version(1).stores({
  // sessions: status is 'active' | 'completed' | 'abandoned'
  // compound index [subject+updatedAt] enables efficient stale-subject queries (3-month rule)
  sessions:
    '++id, subject, status, createdAt, updatedAt, [subject+updatedAt]',

  // sections: linked to a session via sessionId
  // status is 'pending' | 'completed'
  // order is sequential auto-assigned on creation
  sections:
    '++id, sessionId, title, status, order, duration',

  // notes: text and gaps are NOT indexed (IndexedDB bloat avoidance)
  // hasGaps is indexed for efficient dashboard queries
  // gaps is stored as JSON text array (non-indexed)
  // status: 'draft' (auto-saved with 2s debounce) | 'final' (explicit save)
  notes:
    '++id, sectionId, hasGaps, status, createdAt',

  // questions: text and answeredAt are NOT indexed
  // type is one of: 'keyword' | 'methodological' | 'combative'
  questions:
    '++id, sectionId, type',

  // questionnaires: linked to a session, created after study flow
  questionnaires:
    '++id, sessionId, createdAt',

  // questionnaireItems: questionText is NOT indexed
  // source: 'manual' | 'ai', with optional sourceProvider for AI-generated questions
  // sourceQuestionId links back to questions table when imported from interrogative reading
  questionnaireItems:
    '++id, questionnaireId, sectionId, source, sourceProvider, sourceQuestionId',

  // reviewAttempts: repetitions is stored for SM-2 computation on next review
  // sessionId is denormalized here to enable efficient staleness checks
  reviewAttempts:
    '++id, questionnaireItemId, sessionId, score, repetitions, interval, reviewedAt, nextReview',

  // pdfCache: ++id as primary key allows multiple extractions of the same PDF
  // with different page ranges. Compound index [contentHash+pageRange]
  // enables cache-lookup before re-extracting
  pdfCache:
    '++id, [contentHash+pageRange], pageCount, createdAt',

  // settings: simple key-value store for app configuration
  settings:
    'key',
});

export default db;
