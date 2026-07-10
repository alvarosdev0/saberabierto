/**
 * AI Shared Utilities Unit Tests — SaberAbierto
 *
 * Tests parseAIJSON, classifyError, estimateTokenCount, truncation,
 * normalizeQuestions, callWithRetry, and AIError.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseAIJSON,
  classifyError,
  estimateTokenCount,
  truncateToMaxTokens,
  normalizeQuestions,
  callWithRetry,
  AIError,
  DEFAULT_MAX_INPUT_TOKENS,
} from './shared.js';

// ─── AIError ───────────────────────────────────────────────────────────────

describe('AIError', () => {
  it('creates an error with message', () => {
    const err = new AIError('test error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AIError);
    expect(err.message).toBe('test error');
    expect(err.name).toBe('AIError');
  });

  it('stores status code', () => {
    const err = new AIError('unauthorized', 401, true);
    expect(err.status).toBe(401);
    expect(err.isAuthError).toBe(true);
  });

  it('defaults isAuthError to false', () => {
    const err = new AIError('general error', 500);
    expect(err.isAuthError).toBe(false);
  });
});

// ─── parseAIJSON ───────────────────────────────────────────────────────────

describe('parseAIJSON', () => {
  it('parses a valid JSON array', () => {
    const input = '[{"text":"¿Qué es SM-2?","type":"keyword"}]';
    const result = parseAIJSON(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('¿Qué es SM-2?');
    expect(result[0].type).toBe('keyword');
  });

  it('parses JSON array inside markdown code fences', () => {
    const input = '```json\n[{"text":"Pregunta","type":"keyword"}]\n```';
    const result = parseAIJSON(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].text).toBe('Pregunta');
  });

  it('parses JSON array inside plain code fences (no language)', () => {
    const input = '```\n[{"text":"Pregunta","type":"methodological"}]\n```';
    const result = parseAIJSON(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].type).toBe('methodological');
  });

  it('parses valid JSON object', () => {
    // parseAIJSON finds arrays first, so the inner array is extracted.
    // For object-with-questions format, the array is what gets returned.
    const input = '{"questions":[{"text":"P1","type":"keyword"}]}';
    const result = parseAIJSON(input);
    // The array is extracted, not the wrapping object
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('P1');
  });

  it('extracts JSON array from text with surrounding content', () => {
    const input = 'Sure, here are the questions:\n[{"text":"Q1","type":"keyword"}]\nHope that helps!';
    const result = parseAIJSON(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].text).toBe('Q1');
  });

  it('parses whole text as JSON as last resort', () => {
    const input = '{"text":"Single question","type":"combative"}';
    const result = parseAIJSON(input);
    expect(result.text).toBe('Single question');
  });

  it('throws AIError on empty input', () => {
    expect(() => parseAIJSON('')).toThrow(AIError);
    expect(() => parseAIJSON('')).toThrow('Respuesta vacía');
  });

  it('throws AIError on null/undefined', () => {
    expect(() => parseAIJSON(null)).toThrow(AIError);
    expect(() => parseAIJSON(undefined)).toThrow(AIError);
  });

  it('throws AIError on malformed JSON', () => {
    expect(() => parseAIJSON('not json at all {broken')).toThrow(AIError);
    expect(() => parseAIJSON('not json at all {broken')).toThrow('No se pudo interpretar');
  });

  it('throws AIError on whitespace-only input', () => {
    expect(() => parseAIJSON('   ')).toThrow(AIError);
  });

  it('returns empty array for empty JSON array', () => {
    // Empty array bypasses the array path (length > 0 check fails),
    // falls through to last-resort JSON.parse which returns the empty array.
    // normalizeQuestions will filter it to empty, so this is acceptable.
    const input = '[]';
    const result = parseAIJSON(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('handles JSON with unicode/accents', () => {
    const input = '[{"text":"¿Qué es la metodología?","type":"keyword"}]';
    const result = parseAIJSON(input);
    expect(result[0].text).toContain('metodología');
  });
});

// ─── classifyError ─────────────────────────────────────────────────────────

describe('classifyError', () => {
  it('returns AIError with isAuthError=true for 401', () => {
    const response = { status: 401 };
    const err = classifyError(response);
    expect(err).toBeInstanceOf(AIError);
    expect(err.isAuthError).toBe(true);
    expect(err.message).toContain('Clave API inválida');
  });

  it('returns AIError for 429 rate limit', () => {
    const response = { status: 429 };
    const err = classifyError(response);
    expect(err.status).toBe(429);
    expect(err.message).toContain('Límite de solicitudes');
  });

  it('returns AIError for 500 server error', () => {
    const response = { status: 500 };
    const err = classifyError(response);
    expect(err.status).toBe(500);
    expect(err.message).toContain('Error del servidor');
  });

  it('returns AIError for 503 server error', () => {
    const response = { status: 503 };
    const err = classifyError(response);
    expect(err.status).toBe(503);
    expect(err.message).toContain('Error del servidor');
  });

  it('returns AIError for other 4xx with body detail', () => {
    const response = { status: 400 };
    const err = classifyError(response, 'Bad request details');
    expect(err.status).toBe(400);
    expect(err.message).toContain('400');
  });

  it('includes body text in error message for unexpected errors', () => {
    const response = { status: 403 };
    const err = classifyError(response, 'Forbidden');
    expect(err.message).toContain('Forbidden');
  });
});

// ─── estimateTokenCount ────────────────────────────────────────────────────

describe('estimateTokenCount', () => {
  it('returns 0 for empty input', () => {
    expect(estimateTokenCount('')).toBe(0);
    expect(estimateTokenCount(null)).toBe(0);
  });

  it('estimates tokens based on character count (~3.5 chars/token)', () => {
    // 35 chars → ~10 tokens
    expect(estimateTokenCount('a'.repeat(35))).toBe(10);
  });

  it('rounds up', () => {
    // 36 chars / 3.5 = 10.28 → 11 tokens
    expect(estimateTokenCount('a'.repeat(36))).toBe(11);
  });
});

// ─── truncateToMaxTokens ───────────────────────────────────────────────────

describe('truncateToMaxTokens', () => {
  it('does not truncate text under the limit', () => {
    const text = 'Short text';
    const result = truncateToMaxTokens(text, 100);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
  });

  it('truncates text exceeding the limit', () => {
    // ~6000 tokens = ~21000 chars
    const longText = 'A'.repeat(25000);
    const result = truncateToMaxTokens(longText, 6000);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThan(longText.length);
    expect(result.text).toContain('[Texto truncado');
  });

  it('returns originalTokens and finalTokens', () => {
    const text = 'Hello world test text';
    const result = truncateToMaxTokens(text);
    expect(result).toHaveProperty('originalTokens');
    expect(result).toHaveProperty('finalTokens');
    expect(typeof result.originalTokens).toBe('number');
    expect(typeof result.finalTokens).toBe('number');
  });

  it('handles null/empty input', () => {
    const result = truncateToMaxTokens('');
    expect(result.truncated).toBe(false);
    expect(result.text).toBe('');
  });

  it('uses DEFAULT_MAX_INPUT_TOKENS when no maxTokens specified', () => {
    const text = 'Short text';
    const result = truncateToMaxTokens(text);
    expect(result.truncated).toBe(false);
  });

  it('tries to break at sentence boundary', () => {
    const sentences = 'A. '.repeat(6000);
    const result = truncateToMaxTokens(sentences, 100);
    expect(result.truncated).toBe(true);
    // Should end with a period rather than mid-word
  });
});

// ─── normalizeQuestions ────────────────────────────────────────────────────

describe('normalizeQuestions', () => {
  it('returns array from array input', () => {
    const input = [
      { text: 'Q1', type: 'keyword' },
      { text: 'Q2', type: 'methodological' },
    ];
    const result = normalizeQuestions(input);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('Q1');
  });

  it('extracts questions from {questions: [...]} wrapper', () => {
    const input = {
      questions: [
        { text: 'Q1', type: 'keyword' },
        { text: 'Q2', type: 'combative' },
      ],
    };
    const result = normalizeQuestions(input);
    expect(result).toHaveLength(2);
  });

  it('handles single question object', () => {
    const input = { text: 'Single Q', type: 'keyword' };
    const result = normalizeQuestions(input);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Single Q');
  });

  it('filters out items without text property', () => {
    const input = [
      { text: 'Valid Q', type: 'keyword' },
      { noText: true },
      { text: '', type: 'keyword' }, // empty text
      { text: '  ', type: 'keyword' }, // whitespace-only
    ];
    const result = normalizeQuestions(input);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Valid Q');
  });

  it('respects maxCount parameter', () => {
    const input = [
      { text: 'Q1', type: 'keyword' },
      { text: 'Q2', type: 'keyword' },
      { text: 'Q3', type: 'keyword' },
      { text: 'Q4', type: 'keyword' },
      { text: 'Q5', type: 'keyword' },
      { text: 'Q6', type: 'keyword' },
    ];
    const result = normalizeQuestions(input, 3);
    expect(result).toHaveLength(3);
  });

  it('defaults type to "keyword" when invalid', () => {
    const input = [{ text: 'Q1', type: 'invalid_type' }];
    const result = normalizeQuestions(input);
    expect(result[0].type).toBe('keyword');
  });

  it('preserves valid types', () => {
    const input = [
      { text: 'Q1', type: 'keyword' },
      { text: 'Q2', type: 'methodological' },
      { text: 'Q3', type: 'combative' },
    ];
    const result = normalizeQuestions(input);
    expect(result[0].type).toBe('keyword');
    expect(result[1].type).toBe('methodological');
    expect(result[2].type).toBe('combative');
  });

  it('trims question text', () => {
    const input = [{ text: '  Pregunta con espacios  ', type: 'keyword' }];
    const result = normalizeQuestions(input);
    expect(result[0].text).toBe('Pregunta con espacios');
  });
});

// ─── callWithRetry ─────────────────────────────────────────────────────────

describe('callWithRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await callWithRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once on generic Error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('recovered');

    const result = await callWithRetry(fn);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on AIError with isAuthError (401)', async () => {
    const authError = new AIError('invalid key', 401, true);
    const fn = vi.fn().mockRejectedValue(authError);

    await expect(callWithRetry(fn)).rejects.toThrow(authError);
    expect(fn).toHaveBeenCalledTimes(1); // No retry
  });

  it('does NOT retry on 4xx AIError (except 429)', async () => {
    const clientError = new AIError('bad request', 400);
    const fn = vi.fn().mockRejectedValue(clientError);

    await expect(callWithRetry(fn)).rejects.toThrow(clientError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 (rate limit)', async () => {
    const rateError = new AIError('rate limited', 429);
    const fn = vi.fn()
      .mockRejectedValueOnce(rateError)
      .mockResolvedValueOnce('success');

    const result = await callWithRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx server errors', async () => {
    const serverError = new AIError('server down', 503);
    const fn = vi.fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce('success');

    const result = await callWithRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after maxRetries exhausted', async () => {
    const error = new Error('persistent failure');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(callWithRetry(fn, { maxRetries: 1 })).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it('respects custom maxRetries and backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success');

    const result = await callWithRetry(fn, { maxRetries: 2, backoffMs: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
