/**
 * Gemini Provider — SaberAbierto
 *
 * Uses Google's Gemini API via the REST endpoint.
 * API key is passed via query parameter (Google's convention).
 * Stateless instantiation per call — no caching, no stale-key errors.
 *
 * Gemini offers a generous free tier:
 *   - gemini-2.0-flash: 1,500 requests/day free, 1M tokens/min input
 *   - No credit card required for free tier
 *
 * @module services/ai/gemini
 */

import {
  estimateTokenCount,
  truncateToMaxTokens,
  estimateCost,
  callWithRetry,
  parseAIJSON,
  normalizeQuestions,
  classifyError,
  AIError,
  buildSystemPrompt,
} from './shared.js';

/** @type {import('../../types/ai.js').ProviderConfig} */
const CONFIG = {
  name: 'Gemini',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  model: 'gemini-2.0-flash',
  // Paid tier pricing (free tier has daily rate limits)
  costPer1MInputTokens: 0.10,
  costPer1MOutputTokens: 0.40,
};

/**
 * @implements {import('../../types/ai.js').AIProvider}
 */
export class GeminiProvider {
  /** @type {string} */
  name = CONFIG.name;

  /** @type {string} */
  endpoint = CONFIG.endpoint;

  /** @type {string} */
  #apiKey;

  /**
   * @param {string} apiKey — Gemini API key (from aistudio.google.com)
   */
  constructor(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      throw new AIError('Se requiere una clave API de Gemini. Obtén una gratis en aistudio.google.com.', 0, true);
    }
    this.#apiKey = apiKey.trim();
  }

  /**
   * Generate study questions from Markdown content.
   *
   * @param {string}                                    markdown — Markdown text
   * @param {import('../../types/ai.js').GenerateOptions} [options]
   * @returns {Promise<import('../../types/ai.js').GenerateResult>}
   */
  async generateQuestions(markdown, options = {}) {
    const { count = 5, maxInputTokens, language = 'es' } = options;

    if (!markdown || !markdown.trim()) {
      return { questions: [], error: 'No hay texto para generar preguntas.' };
    }

    // Truncate if needed
    const tokenLimit = maxInputTokens || 6000;
    const { text: truncated, truncated: wasTruncated, originalTokens, finalTokens } =
      truncateToMaxTokens(markdown, tokenLimit);

    // Build the request
    const buildRequest = () => this.#makeRequest(truncated, count, language);

    try {
      const parsed = await callWithRetry(buildRequest, { maxRetries: 1, backoffMs: 1000 });
      const questions = normalizeQuestions(parsed, count);

      return {
        questions,
        ...(wasTruncated && {
          warning: `Texto truncado de ${originalTokens.toLocaleString()} a ${finalTokens.toLocaleString()} tokens estimados para ajustarse al límite.`,
        }),
      };
    } catch (err) {
      if (err instanceof AIError) {
        return { questions: [], error: err.message };
      }
      return {
        questions: [],
        error: err instanceof Error ? err.message : 'Error desconocido al contactar Gemini.',
      };
    }
  }

  /**
   * Make the actual API call to Gemini.
   *
   * Gemini uses a different API shape than OpenAI:
   *   - API key goes in the URL query param ?key=
   *   - Messages use "contents" array with "parts" instead of "messages"
   *   - System instruction is a separate top-level field
   *   - Response is nested: candidates[0].content.parts[0].text
   *
   * @private
   */
  async #makeRequest(markdown, count, language = 'es') {
    const systemPrompt = buildSystemPrompt(language);
    const userPrompt = language === 'en'
      ? `Generate ${count} study questions based on this text:\n\n${markdown}`
      : `Genera ${count} preguntas de estudio basadas en este texto:\n\n${markdown}`;

    const url = `${CONFIG.endpoint}/${CONFIG.model}:generateContent?key=${encodeURIComponent(this.#apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            parts: [
              { text: userPrompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw classifyError(response, body);
    }

    const data = await response.json();

    // Extract text from Gemini response format
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      // Check if blocked by safety filters
      const finishReason = data?.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') {
        throw new AIError(
          'Gemini bloqueó la generación por razones de seguridad. Intenta con un texto diferente.',
        );
      }
      throw new AIError('Gemini no devolvió contenido en la respuesta.');
    }

    return parseAIJSON(content);
  }

  /**
   * Estimate cost for a given input.
   *
   * Note: Gemini has a generous free tier, so actual cost may be $0
   * for most usage. This estimate uses paid-tier pricing.
   *
   * @param {string} markdown — Input text
   * @param {number} [expectedOutputTokens=500] — Expected output tokens
   * @returns {{ inputTokens: number, inputCost: number, outputCost: number, totalCost: number, currency: string }}
   */
  estimateRequestCost(markdown, expectedOutputTokens = 500) {
    const inputTokens = estimateTokenCount(markdown);
    return {
      inputTokens,
      ...estimateCost(
        inputTokens,
        expectedOutputTokens,
        CONFIG.costPer1MInputTokens,
        CONFIG.costPer1MOutputTokens,
      ),
    };
  }
}

export default GeminiProvider;
