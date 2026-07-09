/**
 * AI Provider type definitions — SaberAbierto
 *
 * These JSDoc typedefs describe the AIProvider interface and related types.
 * All provider implementations conform to this contract.
 *
 * @module types/ai
 */

/**
 * @typedef {'keyword' | 'methodological' | 'combative'} QuestionType
 *
 *   - keyword:        conceptos clave del texto
 *   - methodological: procedimientos, pasos, metodologías
 *   - combative:      preguntas desafiantes que fuerzan la elaboración
 */

/**
 * @typedef {object} GeneratedQuestion
 * @property {string}        text  — El texto de la pregunta
 * @property {QuestionType}  type  — Tipo de pregunta
 */

/**
 * @typedef {object} GenerateOptions
 * @property {number} [count=5]           — Número de preguntas a generar
 * @property {number} [maxInputTokens=6000] — Máximo de tokens de entrada antes de truncar
 */

/**
 * @typedef {object} GenerateResult
 * @property {GeneratedQuestion[]} questions  — Preguntas generadas (vacío si hubo error)
 * @property {string}              [error]    — Mensaje de error si la generación falló
 */

/**
 * @typedef {object} ProviderConfig
 * @property {string} name     — Nombre visible del proveedor (ej. "DeepSeek")
 * @property {string} endpoint — URL base del endpoint
 * @property {string} model    — Modelo por defecto
 * @property {number} costPer1MInputTokens  — Costo estimado por 1M tokens de entrada (USD)
 * @property {number} costPer1MOutputTokens — Costo estimado por 1M tokens de salida (USD)
 */

/**
 * Interfaz que deben implementar todos los proveedores de IA.
 *
 * @interface AIProvider
 */

/**
 * Nombre del proveedor.
 * @name AIProvider#name
 * @type {string}
 */

/**
 * Endpoint base del proveedor.
 * @name AIProvider#endpoint
 * @type {string}
 */

/**
 * Genera preguntas de estudio a partir de texto Markdown.
 *
 * @function AIProvider#generateQuestions
 * @param {string}          markdown — Texto en formato Markdown
 * @param {GenerateOptions} [options] — Opciones de generación
 * @returns {Promise<GenerateResult>} — Preguntas generadas o error
 */

export {};
