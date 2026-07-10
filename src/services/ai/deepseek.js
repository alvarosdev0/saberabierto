/**
 * DeepSeek Provider — SaberAbierto
 *
 * Uses DeepSeek's chat completions endpoint (OpenAI-compatible API).
 * API key is passed via constructor (stateless instantiation per call).
 *
 * @module services/ai/deepseek
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
  name: 'DeepSeek',
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-chat',
  costPer1MInputTokens: 0.14,
  costPer1MOutputTokens: 0.28,
};

/**
 * @implements {import('../../types/ai.js').AIProvider}
 */
export class DeepSeekProvider {
  /** @type {string} */
  name = CONFIG.name;

  /** @type {string} */
  endpoint = CONFIG.endpoint;

  /** @type {string} */
  #apiKey;

  /**
   * @param {string} apiKey — DeepSeek API key
   */
  constructor(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      throw new AIError('Se requiere una clave API de DeepSeek.', 0, true);
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
        error: err instanceof Error ? err.message : 'Error desconocido al contactar DeepSeek.',
      };
    }
  }

  /**
   * Make the actual API call.
   * @private
   */
  async #makeRequest(markdown, count, language = 'es') {
    const systemPrompt = buildSystemPrompt(language);
    const userPrompt = language === 'en'
      ? `Generate ${count} study questions based on this text:\n\n${markdown}`
      : `Genera ${count} preguntas de estudio basadas en este texto:\n\n${markdown}`;

    const response = await fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify({
        model: CONFIG.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
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
      throw new AIError('DeepSeek no devolvió contenido en la respuesta.');
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

export default DeepSeekProvider;
