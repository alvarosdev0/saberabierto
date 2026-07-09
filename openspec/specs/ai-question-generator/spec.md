# ai-question-generator Specification

## Purpose

Generates study questions from Markdown text using user-configured AI providers (DeepSeek, OpenAI, Anthropic minimum). Users supply their own API key. Architecture supports adding more providers via a common interface.

## Requirements

### Requirement: Provider Configuration

The system MUST allow the user to configure at least three AI providers (DeepSeek, OpenAI, Anthropic) and store their API key per provider in localStorage.

#### Scenario: Configure OpenAI provider
- GIVEN the user opens AI settings
- WHEN they select "OpenAI", enter a valid API key, and save
- THEN the key is stored in localStorage under an `ai_config` key
- AND OpenAI appears as "configured" in the provider list

#### Scenario: Invalid API key detected
- GIVEN a provider is configured with a key
- WHEN the system sends a request and receives a 401 Unauthorized
- THEN the user is notified: "Clave API inválida para {provider}. Verifícala en Ajustes."
- AND no further requests are sent to that provider until the key is updated

### Requirement: Question Generation

The system MUST send the Markdown text to the selected AI provider and return questions in three categories: keyword, methodological, and combative. Input text is truncated to a configurable `maxInputTokens` limit before sending to avoid runaway API costs.

#### Scenario: Generate questions successfully
- GIVEN OpenAI is configured and a 500-word Markdown text is provided
- WHEN the user taps "Generar preguntas"
- THEN the API response is parsed into a list of questions
- AND each question is tagged with one of: keyword, methodological, combative
- AND questions are displayed for user review before saving
- AND the estimated token count and approximate cost are shown before sending

#### Scenario: Network error during generation
- GIVEN the device has no internet connection
- WHEN the user taps "Generar preguntas"
- THEN the system shows: "Sin conexión. La generación de preguntas requiere internet."
- AND no questions are saved

#### Scenario: Malformed JSON response
- GIVEN the AI provider returns a response that is not parseable as JSON
- WHEN the system attempts to extract questions
- THEN the system shows a dismissible error banner: "Error al procesar la respuesta. Intenta de nuevo."
- AND no questions are saved

#### Scenario: Invalid API key
- GIVEN the provider returns HTTP 401 Unauthorized
- WHEN the user taps "Generar preguntas"
- THEN the system shows: "Clave API inválida para {provider}. Verifícala en Ajustes."
- AND no further requests are sent to that provider until the key is updated

#### Scenario: Generation fails with retry
- GIVEN a transient network error occurs (timeout, 5xx)
- WHEN the user taps "Generar preguntas"
- THEN the system retries once after a 1-second backoff
- AND if the retry also fails, shows a dismissible error banner with the failure reason

### Requirement: Provider Extensibility

The system SHOULD define a common provider interface so adding a new AI provider requires only implementing that interface, not modifying core logic. Each provider receives `apiKey` via constructor (class-based), decoupling providers from localStorage access. The context/hook layer reads keys from localStorage and passes them down.

The `generateQuestions` method returns `Promise<GenerateResult>` where `GenerateResult = { questions: GeneratedQuestion[], error?: string }`. Errors are surfaced as user-visible banners, not thrown exceptions.

#### Scenario: Add a fourth provider
- GIVEN the provider interface defines `generateQuestions(text, options?) => Promise<GenerateResult>`
- WHEN a developer implements the interface for a new provider (e.g., Groq)
- THEN the provider appears in the configuration UI after registration
- AND question generation works without changes to study flow logic

#### Scenario: Provider missing required method
- GIVEN a new provider implementation is registered
- WHEN it fails to implement the required `generateQuestions` method
- THEN TypeScript compilation fails
