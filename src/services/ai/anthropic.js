/**
 * Anthropic Provider — SaberAbierto
 *
 * Uses Anthropic's Messages API endpoint.
 * API key is passed via x-api-key header (not Bearer token).
 *
 * @module services/ai/anthropic
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
  name: 'Anthropic',
  endpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-3-5-haiku-20241022',
  costPer1MInputTokens: 0.80,
  costPer1MOutputTokens: 4.00,
};

/**
 * @implements {import('../../types/ai.js').AIProvider}
 */
export class AnthropicProvider {
  /** @type {string} */
  name = CONFIG.name;

  /** @type {string} */
  endpoint = CONFIG.endpoint;

  /** @type {string} */
  #apiKey;

  /**
   * @param {string} apiKey — Anthropic API key
   */
  constructor(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      throw new AIError('Se requiere una clave API de Anthropic.', 0, true);
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
        error: err instanceof Error ? err.message : 'Error desconocido al contactar Anthropic.',
      };
    }
  }

  /**
   * Make the actual API call using Anthropic's Messages endpoint.
   *
   * Anthropic uses a different request format:
   * - Header: x-api-key (not Authorization: Bearer)
   * - Version header: anthropic-version
   * - Body: { model, max_tokens, system, messages }
   *
   * @private
   */
  async #makeRequest(markdown, count, language = 'es') {
    const systemPrompt = buildSystemPrompt(language);
    const userPrompt = language === 'en'
      ? `Generate ${count} study questions based on this text:\n\n${markdown}\n\nRespond ONLY with the JSON array. No explanations.`
      : `Genera ${count} preguntas de estudio basadas en este texto:\n\n${markdown}\n\nResponde ÚNICAMENTE con el array JSON. Sin explicaciones.`;

    const response = await fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.#apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CONFIG.model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw classifyError(response, body);
    }

    const data = await response.json();
    const content = data?.content?.[0]?.text;

    if (!content) {
      throw new AIError('Anthropic no devolvió contenido en la respuesta.');
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

export default AnthropicProvider;
