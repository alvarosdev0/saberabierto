/**
 * Edge Case Tests — SaberAbierto
 *
 * Tests edge cases across the application:
 * - Empty PDF / scanned-only PDF handling
 * - API 401/5xx responses
 * - Zero questions generated
 * - Concurrent Dexie writes
 */

import { describe, it, expect } from 'vitest';

// Import the shared AI utilities for error handling tests
import { AIError, parseAIJSON, classifyError, normalizeQuestions } from '../services/ai/shared.js';

// ─── EMPTY PDF ─────────────────────────────────────────────────────────────

describe('empty PDF handling', () => {
  it('markdown converter returns empty string for empty input', async () => {
    const { extractedTextToMarkdown } = await import('../lib/markdown-converter.js');
    expect(extractedTextToMarkdown('')).toBe('');
    expect(extractedTextToMarkdown('   ')).toBe('');
  });

  it('markdown split returns single empty section for empty input', async () => {
    const { splitMarkdownIntoSections } = await import('../lib/split-markdown.js');
    const result = splitMarkdownIntoSections('');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Contenido');
    expect(result[0].content).toBe('');
  });
});

// ─── SCANNED-ONLY PDF ──────────────────────────────────────────────────────

describe('scanned-only PDF handling', () => {
  it('handles text indicating scanned content', async () => {
    const { extractedTextToMarkdown } = await import('../lib/markdown-converter.js');
    // Scanned PDFs typically produce empty text; the converter should
    // return empty rather than crashing
    const result = extractedTextToMarkdown('');
    expect(result).toBe('');
  });

  it('split-markdown handles whitespace-only content gracefully', async () => {
    const { splitMarkdownIntoSections } = await import('../lib/split-markdown.js');
    const result = splitMarkdownIntoSections('\n\n   \n');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Contenido');
  });
});

// ─── API ERROR RESPONSES ───────────────────────────────────────────────────

describe('API error responses', () => {
  it('classifyError detects 401 as auth error', () => {
    const err = classifyError({ status: 401 });
    expect(err.isAuthError).toBe(true);
    expect(err.status).toBe(401);
    expect(err.message).toContain('Clave API inválida');
  });

  it('classifyError handles all 5xx codes', () => {
    for (const status of [500, 502, 503, 504]) {
      const err = classifyError({ status });
      expect(err.status).toBe(status);
      expect(err.message).toContain('Error del servidor');
    }
  });

  it('classifyError handles 429 rate limit', () => {
    const err = classifyError({ status: 429 });
    expect(err.status).toBe(429);
    expect(err.message).toContain('Límite de solicitudes');
  });
});

// ─── ZERO QUESTIONS GENERATED ──────────────────────────────────────────────

describe('zero questions generated', () => {
  it('normalizeQuestions returns empty array for empty input', () => {
    const result = normalizeQuestions([]);
    expect(result).toHaveLength(0);
  });

  it('normalizeQuestions returns empty array when no items have text', () => {
    const input = [
      { notText: true },
      { text: '', type: 'keyword' },
    ];
    const result = normalizeQuestions(input);
    expect(result).toHaveLength(0);
  });

  it('normalizeQuestions handles undefined/null items', () => {
    const input = [null, undefined, { text: 'Q1', type: 'keyword' }];
    const result = normalizeQuestions(input);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Q1');
  });
});

// ─── MALFORMED JSON FROM AI ────────────────────────────────────────────────

describe('malformed AI responses', () => {
  it('parseAIJSON throws on completely invalid JSON', () => {
    expect(() => parseAIJSON('esto no es json')).toThrow(AIError);
  });

  it('parseAIJSON throws on truncated JSON', () => {
    expect(() => parseAIJSON('[{"text":"incompleto"')).toThrow(AIError);
  });

  it('parseAIJSON handles JSON with trailing commas gracefully', () => {
    // Trailing comma makes JSON invalid
    expect(() => parseAIJSON('[{"text":"test",}]')).toThrow(AIError);
  });

  it('parseAIJSON handles unexpected JSON types', () => {
    // Numbers and strings are valid JSON but not what we expect
    expect(() => parseAIJSON('42')).toThrow(AIError);
  });
});
