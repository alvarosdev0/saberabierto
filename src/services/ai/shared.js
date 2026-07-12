/**
 * Shared AI utilities — SaberAbierto
 *
 * Token estimation, text truncation, cost estimation, and retry logic
 * used by all AI provider implementations.
 *
 * @module services/ai/shared
 */

// ── Constants ──────────────────────────────────────────────────────────────

/** Rough heuristic: ~3.5 characters per token for Spanish text (conservative) */
const CHARS_PER_TOKEN = 3.5;

/** Default max input tokens before truncation */
export const DEFAULT_MAX_INPUT_TOKENS = 6000;

/** Max output tokens requested from the model */
export const DEFAULT_MAX_OUTPUT_TOKENS = 2000;

// ── Token Estimation ──────────────────────────────────────────────────────

/**
 * Estimate the number of tokens in a text string.
 *
 * Uses a character-based heuristic (~3.5 chars/token for Spanish).
 * This is intentionally conservative (over-estimates) to avoid exceeding limits.
 *
 * @param {string} text
 * @returns {number} Estimated token count
 */
export function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ── Input Truncation ──────────────────────────────────────────────────────

/**
 * Truncate text to fit within maxTokens.
 *
 * Truncates at the nearest sentence boundary (., !, ?, newline)
 * to avoid cutting mid-word. Falls back to character truncation
 * if no sentence boundary is found within a reasonable window.
 *
 * @param {string}  text        — Input text
 * @param {number}  [maxTokens] — Maximum allowed tokens (default: 6000)
 * @returns {{ text: string, truncated: boolean, originalTokens: number, finalTokens: number }}
 */
export function truncateToMaxTokens(text, maxTokens = DEFAULT_MAX_INPUT_TOKENS) {
  const originalTokens = estimateTokenCount(text);

  if (originalTokens <= maxTokens || !text) {
    return {
      text,
      truncated: false,
      originalTokens,
      finalTokens: originalTokens,
    };
  }

  const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN);
  const truncated = text.substring(0, maxChars);

  // Try to cut at the nearest sentence boundary
  const sentenceBreak = truncated.match(/[.!?]\s/g);
  const lastBreak = truncated.lastIndexOf('\n\n');

  // Prefer paragraph break, then sentence break, then last space
  let cutPoint;
  if (lastBreak > maxChars * 0.7) {
    cutPoint = lastBreak + 2;
  } else if (sentenceBreak) {
    const lastMatch = truncated.lastIndexOf(sentenceBreak[sentenceBreak.length - 1].trim());
    cutPoint = lastMatch + 1;
  } else {
    const lastSpace = truncated.lastIndexOf(' ');
    cutPoint = lastSpace > maxChars * 0.8 ? lastSpace : maxChars;
  }

  const finalText = truncated.substring(0, cutPoint).trim() + '\n\n[Texto truncado por límite de tokens...]';

  return {
    text: finalText,
    truncated: true,
    originalTokens,
    finalTokens: estimateTokenCount(finalText),
  };
}

// ── Cost Estimation ────────────────────────────────────────────────────────

/**
 * Estimate the cost of an AI request in USD.
 *
 * @param {number} inputTokens         — Estimated input tokens
 * @param {number} outputTokens        — Estimated output tokens (default: 500)
 * @param {number} costPer1MInput      — Provider's cost per 1M input tokens
 * @param {number} costPer1MOutput     — Provider's cost per 1M output tokens
 * @returns {{ inputCost: number, outputCost: number, totalCost: number, currency: string }}
 */
export function estimateCost(
  inputTokens,
  outputTokens = 500,
  costPer1MInput,
  costPer1MOutput,
) {
  const inputCost = (inputTokens / 1_000_000) * costPer1MInput;
  const outputCost = (outputTokens / 1_000_000) * costPer1MOutput;

  return {
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat((inputCost + outputCost).toFixed(6)),
    currency: 'USD',
  };
}

// ── Error Handling ─────────────────────────────────────────────────────────

/**
 * AI-related error with HTTP status code.
 */
export class AIError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   * @param {boolean} [isAuthError=false] — true for 401 (invalid key)
   */
  constructor(message, status = 0, isAuthError = false) {
    super(message);
    this.name = 'AIError';
    this.status = status;
    this.isAuthError = isAuthError;
  }
}

/**
 * Classify an HTTP response as an AIError.
 *
 * @param {Response} response
 * @param {string}   [bodyText] — Response body for error details
 * @returns {AIError}
 */
export function classifyError(response, bodyText = '') {
  if (response.status === 401) {
    return new AIError(
      'Clave API inválida. Verifica tu clave en Ajustes.',
      response.status,
      true,
    );
  }

  if (response.status === 429) {
    return new AIError(
      'Límite de solicitudes excedido. Espera unos segundos e inténtalo de nuevo.',
      response.status,
    );
  }

  if (response.status >= 500) {
    return new AIError(
      `Error del servidor (${response.status}). El servicio puede estar caído. Inténtalo de nuevo.`,
      response.status,
    );
  }

  const detail = bodyText ? `: ${bodyText.substring(0, 200)}` : '';
  return new AIError(
    `Error inesperado (${response.status})${detail}`,
    response.status,
  );
}

// ── Retry Logic ────────────────────────────────────────────────────────────

/**
 * Execute a function with retry logic.
 *
 * Retries once on network errors, 5xx, or malformed JSON.
 * Uses 1 second backoff between attempts.
 * Does NOT retry on 401 (invalid key).
 *
 * @template T
 * @param {() => Promise<T>} fn                  — Function to execute
 * @param {object}           [options]
 * @param {number}           [options.maxRetries=1] — Max retry attempts
 * @param {number}           [options.backoffMs=1000] — Delay between retries
 * @returns {Promise<T>}
 */
export async function callWithRetry(fn, { maxRetries = 1, backoffMs = 1000 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Do NOT retry auth errors
      if (err instanceof AIError && err.isAuthError) {
        throw err;
      }

      // Do NOT retry on 4xx (except 429)
      if (err instanceof AIError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }

      // Last attempt — throw
      if (attempt === maxRetries) {
        throw err;
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}

// ── JSON Parsing ───────────────────────────────────────────────────────────

/**
 * Safely parse JSON from an AI response.
 *
 * Attempts to extract a valid JSON array/object from text that may
 * contain markdown fences, extra text, or other noise.
 *
 * @param {string} rawText — Raw response text from the AI
 * @returns {object|object[]} Parsed JSON
 * @throws {AIError} If no valid JSON could be extracted
 */
export function parseAIJSON(rawText) {
  if (!rawText) {
    throw new AIError('Respuesta vacía del proveedor de IA.');
  }

  let text = rawText.trim();

  // Remove markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Try to find a JSON array first
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Fall through to object try
    }
  }

  // Try to find a JSON object
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch {
      // Fall through to error
    }
  }

  // Last resort: try parsing the whole thing
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
  } catch {
    // Nothing worked
  }

  throw new AIError(
    'No se pudo interpretar la respuesta del proveedor de IA. El formato JSON no es válido.',
  );
}

/**
 * Normalize raw AI response into GeneratedQuestion[].
 *
 * Handles both array responses and object responses with a 'questions' property.
 *
 * @param {object|object[]} parsed   — Parsed JSON from AI response
 * @param {number}          [maxCount] — Max questions to return (default: unlimited)
 * @returns {import('../../types/ai.js').GeneratedQuestion[]}
 */
export function normalizeQuestions(parsed, maxCount) {
  let items = [];

  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed.questions && Array.isArray(parsed.questions)) {
    items = parsed.questions;
  } else if (parsed.text) {
    // Single question object
    items = [parsed];
  }

  // Filter: only objects with text or question property
  const questions = items
    .filter((q) => q && (
      (typeof q.text === 'string' && q.text.trim().length > 0) ||
      (typeof q.question === 'string' && q.question.trim().length > 0)
    ))
    .map((q) => ({
      text: (q.text || q.question || '').trim(),
      type: ['keyword', 'methodological', 'combative'].includes(q.type)
        ? q.type
        : 'keyword',
    }));

  return maxCount ? questions.slice(0, maxCount) : questions;
}

// ── System Prompt Builder ──────────────────────────────────────────────────

/**
 * Build the system prompt for AI question generation in the specified language.
 *
 * @param {'es'|'en'} [language='es'] — Language for the prompt and questions
 * @returns {string} System prompt text
 */
export function buildSystemPrompt(language = 'es') {
  if (language === 'en') {
    return `You are an expert study methodology tutor. Your task is to generate study questions based on the provided text.

Generate questions of the following types:
- "keyword": Questions about key concepts, definitions, and important terms.
- "methodological": Questions about procedures, methodologies, steps, and processes.
- "combative": Challenging questions that force connecting ideas, inferring implications, or applying concepts to new contexts.

Rules:
1. Questions must be in English.
2. Each question must be clear, specific, and based on the provided text.
3. Do NOT invent information not present in the text.
4. Generate a balanced mix of all three types.

Respond ONLY with a JSON array of objects with this structure:
[{"text": "Question?", "type": "keyword"}]

Do not include explanations, comments, or additional text. Only the JSON array.`;
  }

  // Default: Spanish
  return `Eres un tutor experto en metodología de estudio. Tu tarea es generar preguntas de estudio basadas en el texto proporcionado.

Genera preguntas de los siguientes tipos:
- "keyword": Preguntas sobre conceptos clave, definiciones y términos importantes.
- "methodological": Preguntas sobre procedimientos, metodologías, pasos y procesos.
- "combative": Preguntas desafiantes que obligan a relacionar ideas, inferir implicaciones o aplicar conceptos a nuevos contextos.

Reglas:
1. Las preguntas deben estar en español.
2. Cada pregunta debe ser clara, específica y basada en el texto proporcionado.
3. NO inventes información que no esté en el texto.
4. Genera una mezcla equilibrada de los tres tipos.

Responde ÚNICAMENTE con un array JSON de objetos con esta estructura:
[{"text": "¿Pregunta?", "type": "keyword"}]

No incluyas explicaciones, comentarios ni texto adicional. Solo el array JSON.`;
}
