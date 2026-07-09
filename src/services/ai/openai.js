/**
 * OpenAI Provider — SaberAbierto
 *
 * Uses OpenAI's native chat completions endpoint.
 * API key is passed via constructor (stateless instantiation per call).
 *
 * @module services/ai/openai
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
  QUESTION_SYSTEM_PROMPT,
} from './shared.js';

/** @type {import('../../types/ai.js').ProviderConfig} */
const CONFIG = {
  name: 'OpenAI',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  costPer1MInputTokens: 0.15,
  costPer1MOutputTokens: 0.60,
};

/**
 * @implements {import('../../types/ai.js').AIProvider}
 */
export class OpenAIProvider {
  /** @type {string} */
  name = CONFIG.name;

  /** @type {string} */
  endpoint = CONFIG.endpoint;

  /** @type {string} */
  #apiKey;

  /**
   * @param {string} apiKey — OpenAI API key
   */
  constructor(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      throw new AIError('Se requiere una clave API de OpenAI.', 0, true);
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
    const { count = 5, maxInputTokens } = options;

    if (!markdown || !markdown.trim()) {
      return { questions: [], error: 'No hay texto para generar preguntas.' };
    }

    // Truncate if needed
    const tokenLimit = maxInputTokens || 6000;
    const { text: truncated, truncated: wasTruncated, originalTokens, finalTokens } =
      truncateToMaxTokens(markdown, tokenLimit);

    // Build the request
    const buildRequest = () => this.#makeRequest(truncated, count);

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
        error: err instanceof Error ? err.message : 'Error desconocido al contactar OpenAI.',
      };
    }
  }

  /**
   * Make the actual API call.
   * @private
   */
  async #makeRequest(markdown, count) {
    const response = await fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify({
        model: CONFIG.model,
        messages: [
          { role: 'system', content: QUESTION_SYSTEM_PROMPT },
          { role: 'user', content: `Genera ${count} preguntas de estudio basadas en este texto:\n\n${markdown}` },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw classifyError(response, body);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new AIError('OpenAI no devolvió contenido en la respuesta.');
    }

    return parseAIJSON(content);
  }

  /**
   * Estimate cost for a given input.
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

export default OpenAIProvider;
