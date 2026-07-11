/**
 * AI Provider Factory — SaberAbierto
 *
 * Stateless factory that maps provider name strings to class references.
 * Each call to createProvider instantiates a fresh provider instance
 * with the given API key — no caching, no stale-key errors.
 *
 * @module services/ai/index
 */

import { DeepSeekProvider } from './deepseek.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { AIError } from './shared.js';

/**
 * Registry mapping provider ID → class reference.
 *
 * @type {Record<string, new (apiKey: string) => import('../../types/ai.js').AIProvider>}
 */
const PROVIDER_REGISTRY = {
  deepseek: DeepSeekProvider,
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  gemini: GeminiProvider,
};

/**
 * Valid provider IDs.
 * @type {string[]}
 */
export const PROVIDER_IDS = Object.keys(PROVIDER_REGISTRY);

/**
 * Provider display metadata.
 * @type {Record<string, { name: string, model: string }>}
 */
export const PROVIDER_META = {
  deepseek: { name: 'DeepSeek', model: 'deepseek-chat' },
  openai: { name: 'OpenAI', model: 'gpt-4o-mini' },
  anthropic: { name: 'Anthropic', model: 'claude-3-5-haiku' },
  gemini: { name: 'Gemini', model: 'gemini-3.1-flash-lite' },
};

/**
 * Create a fresh provider instance.
 *
 * Reads nothing from localStorage — the caller is responsible
 * for passing the API key. This ensures stale keys are never used
 * after the user updates their key in Settings.
 *
 * @param {'deepseek' | 'openai' | 'anthropic' | 'gemini'} providerId — Provider identifier
 * @param {string}                               apiKey      — API key for the provider
 * @returns {import('../../types/ai.js').AIProvider}
 * @throws {AIError} If providerId is unrecognized
 *
 * @example
 *   const provider = createProvider('deepseek', 'sk-xxx');
 *   const result = await provider.generateQuestions(markdown, { count: 5 });
 */
export function createProvider(providerId, apiKey) {
  const ProviderClass = PROVIDER_REGISTRY[providerId];

  if (!ProviderClass) {
    throw new AIError(
      `Proveedor "${providerId}" no reconocido. Usa: ${PROVIDER_IDS.join(', ')}.`,
    );
  }

  return new ProviderClass(apiKey);
}

export { DeepSeekProvider, OpenAIProvider, AnthropicProvider, GeminiProvider };
