# Tasks: SaberAbierto — App de Estudio

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 5000–8000 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 |
| Delivery strategy | force-chained |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Scaffolding + Dexie schema + PWA config + design tokens | PR 1 | Base: main; verifiable via `pnpm dev` + PWA install prompt |
| 2 | PDF pipeline + Markdown converter + editable preview | PR 2 | Base: main (merge after PR 1); verifiable via upload smoke test |
| 3 | AI providers (DeepSeek, OpenAI, Anthropic) + Settings | PR 3 | Base: main (merge after PR 2); verifiable via question generation with test key |
| 4 | Study flow: sessions, sections, interrogative reading, brain dump | PR 4 | Base: main (merge after PR 3); verifiable via full reading→brain-dump walkthrough |
| 5 | Questionnaire builder + SM-2 spaced retrieval | PR 5 | Base: main (merge after PR 4); verifiable via questionnaire creation + review scoring |
| 6 | Dashboard + polish + tests | PR 6 | Base: main (merge after PR 5); verifiable via Lighthouse PWA audit ≥90 + test suite |

## Phase 1: Foundation (PR 1)

- [x] 1.1 Scaffold project: `npm create vite` with React template, add Tailwind CSS v4, React Router (hash), Dexie.js v4, vite-plugin-pwa
- [x] 1.2 Create project structure: `src/{components,pages,hooks,services,lib,types}/` directories
- [x] 1.3 Implement Dexie schema in `src/services/db.js`: all 9 tables with indexes per design §Dexie Schema
- [x] 1.4 Configure vite-plugin-pwa: manifest, service worker with Workbox cache-first (static) + network-first (API) strategy
- [x] 1.5 Configure hash-based React Router in `src/App.jsx` with all 9 routes per design §Route Design, using React.lazy + Suspense for code splitting
- [x] 1.6 Define CSS custom properties + design tokens in `src/index.css`: colors, font stacks, touch target rule (≥44 px)
- [x] 1.7 Add Baloo 2 font import + system sans-serif fallback stack
- [x] 1.8 Create skeleton `Layout` component with nav bar + PWA update banner placeholder

## Phase 2: PDF Processing Pipeline (PR 2)

- [ ] 2.1 Create `src/services/pdf.js`: dynamic `import("pdfjs-dist")` with lazy-load guard (first-call detection)
- [ ] 2.2 Build `FileDropzone` component: accept `.pdf` only, reject non-PDF with error message, display filename
- [ ] 2.3 Build `ThumbnailGrid` with IntersectionObserver-based virtual scroll (8-10 visible thumbnails); ~150 px height per thumbnail
- [ ] 2.4 Implement page selection: range input ("23-45") + individual tap toggles with selection count display
- [ ] 2.5 Implement text extraction: iterate selected pages via pdfjs-dist, handle scanned-page empty-text notification, concatenate results
- [ ] 2.6 After extraction: call `pdfDocument.destroy()` + `PDFWorker.destroy()` + `requestIdleCallback` for GC hint
- [ ] 2.7 Cache extraction results in Dexie `pdfCache` with `[contentHash+pageRange]` compound index lookups before re-extracting
- [ ] 2.8 Build `ExtractionProgress` component: progress bar during extraction, word count on completion

## Phase 3: Markdown & AI (PR 3)

- [ ] 3.1 Implement `src/lib/markdown-converter.js`: auto-convert extracted text to MD (headings, paragraphs, lists)
- [ ] 3.2 Build `MarkdownEditor` page: editable textarea with MD preview, "Aceptar" button, "Regenerar" re-extract option
- [ ] 3.3 Define AI provider TypeScript interface (`AIProvider`, `GenerateOptions`, `GenerateResult`, `GeneratedQuestion`)
- [ ] 3.4 Implement provider factory: `src/services/ai/index.js` maps `"deepseek"|"openai"|"anthropic"` → class; stateless instantiation per call
- [ ] 3.5 Implement `OpenAIProvider`: native chat-completions endpoint, JSON response parsing, `apiKey` via constructor
- [ ] 3.6 Implement `DeepSeekProvider`: same interface, DeepSeek chat endpoint
- [ ] 3.7 Implement `AnthropicProvider`: same interface, Anthropic Messages endpoint
- [ ] 3.8 Add error handling: 401 invalid key detection (blocks further requests), malformed JSON (retry once 1 s backoff), network errors, 5xx retry
- [ ] 3.9 Implement maxInputTokens truncation + per-request cost estimation display in UI
- [ ] 3.10 Add CSP `<meta>` tag: `script-src 'self'` minimum
- [ ] 3.11 Build `Settings` page: provider selector, masked API key input, data export/import buttons (import/export logic deferred to Phase 6)

## Phase 4: Study Flow (PR 4)

- [ ] 4.1 Implement session CRUD in `src/hooks/useSession.js`: create (only one active), update status, query with `[subject+updatedAt]` index
- [ ] 4.2 Implement section management: `src/hooks/useSections.js` with sequential `order` auto-assignment, status tracking, duration write
- [ ] 4.3 Build `SectionNavigator` component: next/previous buttons, "X/N" progress indicator, route navigation
- [ ] 4.4 Build `InterrogativeReading` page: split pane (Markdown read-only left + QuestionForm right), 3 type tabs, auto-save draft with 2 s debounce
- [ ] 4.5 Add `QuestionList` with answer checkbox + timestamp to InterrogativeReading
- [ ] 4.6 Build `BrainDump` page: free-form text area, outline marker support, gap flagging with highlight, auto-save draft with 2 s debounce
- [ ] 4.7 Add `GapHighlighter` component: select text → "Marcar como laguna" → persist `gaps: [...]` JSON array in `notes` table
- [ ] 4.8 Build `Timer` component: count-up display, pause on navigation, write elapsed to `sections.duration`
- [ ] 4.9 Implement `ModeSwitch` tab bar: "Lectura Interrogativa" ↔ "Brain Dump" per section
- [ ] 4.10 Build `MarkdownEditor` route integration: post-extraction review → confirm → create session + sections

## Phase 5: Questionnaire & Spaced Retrieval (PR 5)

- [ ] 5.1 Build `QuestionnaireBuilder` page: manual question entry with "Forza la elaboración…" guidance text, section selector, empty-field validation
- [ ] 5.2 Implement AI question import panel: list generated questions per section, select multi, import → `questionnaireItems` with `source: 'ai'`
- [ ] 5.3 Implement reading question import panel: list interrogative-reading questions per section, select multi, import → `questionnaireItems` with `source: 'manual'`
- [ ] 5.4 Implement `src/services/sm2.js`: `calculateNextReview(score, reps, interval)` with score 2 vs 3 differentiation, 6-month cap
- [ ] 5.5 Build `SpacedRetrieval` page: due review queue (query `reviewAttempts` by `nextReview ≤ today`), flip-card UI
- [ ] 5.6 Build `ScoreSelector` component: 0-1-2-3 with labels ("Olvidé", "Parcial", "Correcto con esfuerzo", "Perfecto"), write to `reviewAttempts`
- [ ] 5.7 Implement `StaleSubjectBanner`: query `sessions` compound index for >90 days gap, show "Repasar notas" button before first question
- [ ] 5.8 Build review history view: render past `reviewAttempts` with scores, dates, interval progression
- [ ] 5.9 Implement `navigator.setAppBadge()` call on app open for due review count; fallback gracefully on unsupported browsers

## Phase 6: Dashboard & Polish (PR 6)

- [ ] 6.1 Build `HomeDashboard`: active session card with "Continuar" + section progress, "Nueva sesión" button when none active
- [ ] 6.2 Add `QuickStats` component: total answered, reviews done, streak (consecutive study days), due-review badge count
- [ ] 6.3 Add `ReviewCountdown`: relative time display ("hoy", "en 2 días"), query next `reviewAttempts.nextReview`
- [ ] 6.4 Add `ReviewsDueBanner` + `GapsToRevisit` section: list flagged gaps from `notes.hasGaps` index, link to brain dump notes
- [ ] 6.5 Build session history page: list past sessions with subject, dates, completion status
- [ ] 6.6 Implement data export: serialize all Dexie tables → downloadable JSON file
- [ ] 6.7 Implement data import: parse JSON → validate structure → restore to Dexie
- [ ] 6.8 Add keyboard avoidance: `visualViewport` API listener, scroll active input into view
- [ ] 6.9 Audit touch targets: ensure all buttons/checkboxes/tabs ≥44 px in at least one dimension
- [ ] 6.10 Implement SW update banner: `updatefound` → "Nueva versión disponible" banner → `skipWaiting()` + reload
- [ ] 6.11 Add offline indicator via `navigator.onLine` listener + visual banner

## Phase 7: Testing (PR 6)

- [ ] 7.1 Write unit tests for `calculateNextReview`: all SM-2 score paths, edge cases (0 reps, 6-month cap, reset)
- [ ] 7.2 Write unit tests for `markdown-converter`: headings, paragraphs, lists, plain text input
- [ ] 7.3 Write unit tests for AI provider parsers: valid JSON, malformed JSON, empty response, error paths
- [ ] 7.4 Write unit tests for Dexie query helpers: session filtering, due reviews, gap queries
- [ ] 7.5 Write integration tests (React Testing Library): upload→extract→convert→generate→session→review flow
- [ ] 7.6 Write integration tests: offline state → error messages, re-connection recovery
- [ ] 7.7 Configure Lighthouse CI check for PWA audit score ≥90
- [ ] 7.8 Test edge cases: empty PDF, scanned-only PDF, API 401/5xx, zero questions generated, concurrent Dexie writes
