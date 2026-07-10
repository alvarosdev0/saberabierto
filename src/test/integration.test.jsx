/**
 * Integration Tests — SaberAbierto
 *
 * Tests key components and flows using React Testing Library.
 * Uses fake-indexeddb to polyfill IndexedDB for Dexie-dependent components.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Suspense } from 'react';
import db from '../services/db.js';

// ─── Database setup ────────────────────────────────────────────────────────

beforeAll(async () => {
  await db.open();
});

beforeEach(async () => {
  // Clear all tables
  const tables = ['sessions', 'sections', 'notes', 'questions', 'questionnaires',
    'questionnaireItems', 'reviewAttempts', 'pdfCache', 'settings'];
  await Promise.all(tables.map((t) => db.table(t).clear()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Layout Component ──────────────────────────────────────────────────────

describe('Layout component', () => {
  it('renders navigation links', async () => {
    const Layout = (await import('../components/Layout.jsx')).default;

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Subir')).toBeInTheDocument();
    expect(screen.getByText('Repaso')).toBeInTheDocument();
    expect(screen.getByText('Ajustes')).toBeInTheDocument();
  });

  it('shows online state by default', async () => {
    const Layout = (await import('../components/Layout.jsx')).default;

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    // No offline banner should be visible when online
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
  });
});

// ─── SM-2 Flow ─────────────────────────────────────────────────────────────

describe('SM-2 algorithm flow', () => {
  it('follows a complete review progression path', () => {
    const { calculateNextReview } = require('../services/sm2.js');

    // First review: perfect (3)
    const r1 = calculateNextReview(3, 0, 0);
    expect(r1.interval).toBe(1);
    expect(r1.repetitions).toBe(1);

    // Second review: also perfect
    const r2 = calculateNextReview(3, r1.repetitions, r1.interval);
    expect(r2.interval).toBe(4);
    expect(r2.repetitions).toBe(2);

    // Third review: correct with effort (2)
    const r3 = calculateNextReview(2, r2.repetitions, r2.interval);
    // 4 × 2 = 8
    expect(r3.interval).toBe(8);
    expect(r3.repetitions).toBe(3);

    // Fourth review: partial (1)
    const r4 = calculateNextReview(1, r3.repetitions, r3.interval);
    expect(r4.interval).toBe(8); // same
    expect(r4.repetitions).toBe(3); // not incremented

    // Fifth review: forgot (0)
    const r5 = calculateNextReview(0, r4.repetitions, r4.interval);
    expect(r5.interval).toBe(1); // reset
    expect(r5.repetitions).toBe(0); // reset
  });
});

// ─── Markdown converter flow ───────────────────────────────────────────────

describe('markdown converter flow', () => {
  it('converts full PDF extraction to sections', async () => {
    const { extractedTextToMarkdown } = await import('../lib/markdown-converter.js');
    const { splitMarkdownIntoSections } = await import('../lib/split-markdown.js');

    const input = [
      'INTRODUCCIÓN A LA BIOLOGÍA',
      '',
      'La biología es la ciencia que estudia los seres vivos.',
      '',
      'CÉLULAS',
      '',
      'Las células son la unidad básica de la vida. Existen dos tipos principales:',
      '',
      '1. Células procariotas',
      '2. Células eucariotas',
      '',
      'Las células eucariotas tienen núcleo definido.',
    ].join('\n');

    const md = extractedTextToMarkdown(input);
    expect(md).toContain('## INTRODUCCIÓN A LA BIOLOGÍA');
    expect(md).toContain('## CÉLULAS');

    const sections = splitMarkdownIntoSections(md);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.some((s) => s.title === 'INTRODUCCIÓN A LA BIOLOGÍA')).toBe(true);
    expect(sections.some((s) => s.title === 'CÉLULAS')).toBe(true);
  });
});

// ─── AI provider flow ──────────────────────────────────────────────────────

describe('AI provider flow', () => {
  it('parseAIJSON → normalizeQuestions → valid output', () => {
    const { parseAIJSON, normalizeQuestions } = require('../services/ai/shared.js');

    const rawResponse = `\`\`\`json
[
  {"text": "¿Qué es el SM-2?", "type": "keyword"},
  {"text": "¿Cómo funciona el repaso espaciado?", "type": "methodological"},
  {"text": "¿Por qué es mejor que el repaso masivo?", "type": "combative"}
]
\`\`\``;

    const parsed = parseAIJSON(rawResponse);
    const questions = normalizeQuestions(parsed, 5);

    expect(questions).toHaveLength(3);
    expect(questions[0].text).toContain('SM-2');
    expect(questions[1].type).toBe('methodological');
    expect(questions[2].type).toBe('combative');
  });

  it('handles the full AI → normalize pipeline for {questions: [...]} format', () => {
    const { parseAIJSON, normalizeQuestions } = require('../services/ai/shared.js');

    const rawResponse = '{"questions": [{"text": "Q1", "type": "keyword"}, {"text": "Q2", "type": "keyword"}]}';
    const parsed = parseAIJSON(rawResponse);
    const questions = normalizeQuestions(parsed, 2);

    expect(questions).toHaveLength(2);
  });
});

// ─── Dexie CRUD flow ───────────────────────────────────────────────────────

describe('Dexie CRUD flow', () => {
  it('full session → sections → notes lifecycle', async () => {
    // Create session
    const sessionId = await db.sessions.add({
      subject: 'Biología Celular',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create sections
    const section1Id = await db.sections.add({
      sessionId,
      title: 'Introducción',
      status: 'pending',
      order: 1,
      duration: 0,
    });

    const section2Id = await db.sections.add({
      sessionId,
      title: 'Células',
      status: 'pending',
      order: 2,
      duration: 0,
    });

    // Verify sections exist
    const sections = await db.sections.where('sessionId').equals(sessionId).toArray();
    expect(sections).toHaveLength(2);

    // Add notes with gaps
    await db.notes.add({
      sectionId: section1Id,
      hasGaps: 1,
      status: 'final',
      createdAt: new Date(),
    });

    // Add questions
    await db.questions.add({
      sectionId: section1Id,
      text: '¿Qué es una célula?',
      type: 'keyword',
      answered: false,
    });

    await db.questions.add({
      sectionId: section2Id,
      text: '¿Diferencia entre procariota y eucariota?',
      type: 'methodological',
      answered: false,
    });

    // Verify questions
    const questions = await db.questions.where('sectionId').equals(section1Id).toArray();
    expect(questions).toHaveLength(1);

    // Create questionnaire
    const questionnaireId = await db.questionnaires.add({
      sessionId,
      createdAt: new Date(),
    });

    // Add questionnaire items
    await db.questionnaireItems.add({
      questionnaireId,
      sectionId: section1Id,
      source: 'manual',
    });

    // Verify items
    const items = await db.questionnaireItems.where('questionnaireId').equals(questionnaireId).toArray();
    expect(items).toHaveLength(1);

    // Mark session completed
    await db.sessions.update(sessionId, { status: 'completed', updatedAt: new Date() });
    const updated = await db.sessions.get(sessionId);
    expect(updated.status).toBe('completed');
  });
});
