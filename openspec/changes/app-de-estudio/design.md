# Design: SaberAbierto — App de Estudio

## Technical Approach

React 19 + Vite + Tailwind CSS v4 single-page PWA with hash-based routing (React Router). All study data persists client-side via Dexie.js v4 (IndexedDB). pdfjs-dist v4 is dynamically imported only on PDF upload to keep initial bundle ~50 KB. AI providers are abstracted behind a shared interface; user supplies their own API key stored in localStorage. SM-2 spaced repetition runs fully client-side with in-app review reminders (badge counts, dashboard banner, Periodic Background Sync as progressive enhancement — no backend push server).

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Hash vs. History router | Hash avoids 404 on PWA refresh | **Hash router** for offline reliability |
| IndexedDB vs. `localStorage` for study data | IndexedDB: larger quotas, indexed queries | **Dexie.js** — typed wrapper, migrations |
| Service worker: network-first vs. cache-first | Network-first for API, cache-first for assets | **Hybrid**: cache-first for static, network-first for AI calls |
| State: React Context vs. Zustand vs. Redux | Zustand: lightweight, selector-based re-renders | **React Context** — sufficient for session-centric app; no global state needed beyond active session ID |
| pdfjs-dist: bundled vs. lazy | 3 MB hurts first load | **Dynamic `import()`** on upload click only |

## PDF Processing Details

- **Lazy load**: pdfjs-dist imported via dynamic `import()` only on first PDF upload. Subsequent uploads reuse the cached module.
- **Memory management**: After extraction completes, call `pdfDocument.destroy()` and `PDFWorker.destroy()` explicitly to free the ~80-150 MB allocation. Use `requestIdleCallback` to hint the browser GC.
- **Thumbnail virtualization**: Render only visible thumbnails (8-10 at a time) using Intersection Observer in a virtual scroll container. This keeps DOM node count bounded regardless of PDF page count.

## Project Structure

```
src/
├── components/        # Reusable UI: ThumbnailGrid, Timer, MarkdownPreview, QuestionCard
├── pages/             # Route-level: Home, Upload, Read, BrainDump, Questionnaire, Review, Settings
├── hooks/             # useSession, useDexie, useAIProvider, useSM2
├── services/          # Dexie db, AI providers, PDF processor, SM-2 engine
│   ├── db.js          # Dexie schema + helpers
│   ├── ai/            # Provider implementations (deepseek, openai, anthropic)
│   ├── pdf.js         # Lazy-loaded PDF processing
│   └── sm2.js         # SM-2 algorithm
├── lib/               # Markdown converter, text sanitizers, date helpers
├── types/             # TypeScript interfaces
└── App.jsx            # Root: Router, Layout, PWA registration
```

## Route Design

| Route | Page | Description |
|-------|------|-------------|
| `/` | HomeDashboard | Active session, quick stats, next review countdown |
| `/upload` | PDFUpload | File picker, thumbnails, page selection, extract |
| `/session/:id/section/:sectionId/read` | InterrogativeReading | Split pane: MD text + question form (3 tabs) |
| `/session/:id/section/:sectionId/brain-dump` | BrainDump | Free-form notes, outline markers, gap flagging |
| `/session/:id/section/:sectionId/review-md` | MarkdownEditor | Editable MD preview after PDF extraction |
| `/session/:id/questionnaire` | QuestionnaireBuilder | Manual + AI-imported exam questions + import from reading questions |
| `/review` | SpacedRetrieval | Due review queue, SM-2 scoring |
| `/review/:questionnaireId` | ReviewSession | Focused review of one questionnaire |
| `/settings` | Settings | API key config, AI provider selection, data export/import |

## Dexie Schema

```javascript
// services/db.js
const db = new Dexie("saberabierto");

db.version(1).stores({
  // sessions: status is 'active' | 'completed' | 'abandoned'
  // compound index [subject+updatedAt] enables efficient stale-subject queries (3-month rule)
  sessions:     "++id, subject, status, createdAt, updatedAt, [subject+updatedAt]",

  sections:     "++id, sessionId, title, status, order, duration",

  // notes: text and gaps are NOT indexed (IndexedDB bloat avoidance).
  // Only FK and sort fields are indexed. hasGaps is indexed for efficient dashboard queries.
  // gaps is stored as JSON text array (non-indexed); hasGaps enables dashboard query without content scan.
  // status: 'draft' (auto-saved with 2s debounce) | 'final' (explicit save)
  notes:        "++id, sectionId, hasGaps, status, createdAt",

  // questions: text and answeredAt are NOT indexed.
  questions:    "++id, sectionId, type, answered",

  questionnaires: "++id, sessionId, createdAt",

  // questionnaireItems: questionText is NOT indexed.
  // source: 'manual' | 'ai', with optional sourceProvider for AI-generated questions.
  // sourceQuestionId links back to questions table when imported from interrogative reading.
  questionnaireItems: "++id, questionnaireId, sectionId, source, sourceProvider, sourceQuestionId",

  // reviewAttempts: repetitions is stored for SM-2 computation on next review.
  // sessionId is denormalized here to enable efficient staleness checks without 4-query join chains.
  reviewAttempts: "++id, questionnaireItemId, sessionId, score, repetitions, interval, reviewedAt, nextReview",

  // pdfCache: ++id as primary key allows multiple extractions of the same PDF
  // with different page ranges. Compound index [contentHash+pageRange]
  // enables cache-lookup before re-extracting.
  pdfCache:     "++id, [contentHash+pageRange], text, pageCount, createdAt",

  settings:     "key"
});
```

## AI Provider Interface

```typescript
interface AIProvider {
  name: string;
  endpoint: string;
  generateQuestions(markdown: string, options?: GenerateOptions): Promise<GenerateResult>;
}

interface GenerateOptions {
  /** Number of questions to generate (default: 5) */
  count?: number;
  /** Max input tokens before truncation (avoids runaway API costs). Show estimated cost in UI. */
  maxInputTokens?: number;
}

interface GenerateResult {
  questions: GeneratedQuestion[];
  /** Present if generation failed. UI shows a user-visible error banner. */
  error?: string;
}

interface GeneratedQuestion {
  text: string;
  type: "keyword" | "methodological" | "combative";
}
```

**Error handling**: Implementations MUST handle malformed JSON responses, network errors, and invalid API keys (401). Retry once with exponential backoff (1 s delay). On persistent failure, return `{ questions: [], error: "message" }` so the UI renders a dismissible error banner.

**Decoupling from localStorage**: Each provider class accepts `apiKey` via constructor:

```typescript
class OpenAIProvider implements AIProvider {
  constructor(private apiKey: string) {}
  async generateQuestions(markdown: string, options?: GenerateOptions): Promise<GenerateResult> {
    // ... posts to native chat-completions endpoint, parses JSON response
  }
}
```

The context/hook layer reads from localStorage and passes the key down. Provider registry in `services/ai/index.js` maps `"deepseek" | "openai" | "anthropic"` → class reference.

**IMPORTANT:** Providers MUST be instantiated on-demand (stateless factory pattern) rather than cached. The hook/context reads the API key from localStorage on each generation call and creates a fresh provider instance. This prevents stale-key errors after the user updates their key in Settings.

## SM-2 Algorithm

```typescript
function calculateNextReview(
  score: 0 | 1 | 2 | 3,
  repetitions: number,
  previousInterval: number
): { interval: number; nextReviewDate: Date; repetitions: number } {
  // Score 0 ("forgot"): reset to interval=1, repetitions=0
  if (score === 0) {
    return { interval: 1, nextReviewDate: addDays(new Date(), 1), repetitions: 0 };
  }
  // Score 1 ("partial"): same interval, no repetition increment
  if (score === 1) {
    return { interval: previousInterval || 1, nextReviewDate: addDays(new Date(), previousInterval || 1), repetitions };
  }
  // Score 2 ("correct with effort"): interval × 2
  // Score 3 ("perfect recall"): interval × 2.5
  const multiplier = score === 3 ? 2.5 : 2;
  const newReps = repetitions + 1;
  const interval = repetitions === 0 ? 1
    : repetitions === 1 ? 4
    : Math.min(Math.round(previousInterval * multiplier), 180); // cap: 6 months
  return {
    interval,
    nextReviewDate: addDays(new Date(), interval),
    repetitions: newReps,
  };
}
```

## Component Tree

```
App
├── Layout (nav + PWA update banner)
├── HomeDashboard
│   ├── SubjectCard (active session, progress bar, "Continuar")
│   ├── QuickStats (streak, total answered, reviews done)
│   ├── ReviewCountdown (next due, relative time)
│   ├── ReviewsDueBanner (in-app badge when reviews are overdue)
│   └── GapsToRevisit (flagged knowledge gaps from brain dumps)
├── PDFUpload
│   ├── FileDropzone
│   ├── ThumbnailGrid (virtual-scroll, IntersectionObserver, 8-10 visible)
│   ├── PageRangeInput
│   └── ExtractionProgress
├── MarkdownEditor
│   ├── EditableTextarea (MD preview with editing)
│   ├── AceptarButton (confirm MD and proceed)
│   └── RegenerarFromPDF (re-extract from cached PDF)
├── InterrogativeReading
│   ├── SectionNavigator (next/previous section, progress indicator)
│   ├── ModeSwitch (tab bar: "Lectura Interrogativa" | "Brain Dump" — switches between read and brain-dump modes per section)
│   ├── Timer (count-up elapsed tracker, optional, writes to sections.duration)
│   ├── MarkdownPane (scrollable, read-only)
│   └── QuestionForm (Keyword | Methodological | Combative tabs, auto-save draft with 2s debounce)
│       └── QuestionList (with answer checkbox)
│       └── ContinuarBrainDump (action button: "Continuar a Brain Dump" → /session/:id/section/:sectionId/brain-dump)
├── BrainDump
│   ├── SectionNavigator (next/previous section, progress indicator)
│   ├── ModeSwitch (tab bar: "Lectura Interrogativa" | "Brain Dump")
│   ├── Timer (count-up elapsed tracker, optional, writes to sections.duration)
│   ├── OutlineTextArea (free-form, gap-flagging, auto-save draft with 2s debounce)
│   ├── GapHighlighter
│   └── VolverLectura (action button: "Volver a Lectura" → /session/:id/section/:sectionId/read)
├── QuestionnaireBuilder
│   ├── QuestionList (manual entries)
│   ├── AIQuestionImportPanel
│   ├── ReadingQuestionImportPanel ("Importar de preguntas de lectura")
│   └── SectionSelector (links question → source section)
├── SpacedRetrieval
│   ├── ReviewQueue (due items)
│   ├── QuestionCard (flip: question → answer)
│   ├── ScoreSelector (0-1-2-3 with labels)
│   └── StaleSubjectBanner (shows when >90 days since last session; allows notes review before answering)
└── Settings
    ├── ProviderSelector
    ├── ApiKeyInput (masked)
    ├── ExportData (serialize all Dexie tables → downloadable JSON)
    └── ImportData (restore from JSON file)
```

## Data Flow

```
PDF file ──→ pdfjs-dist (lazy) ──→ raw text ──→ Dexie pdfCache (hash+range)
                                                     │
                               markdown-converter ◄──┘
                                                     │
                    MarkdownEditor (review + edit) ◄──┘
                              │
                     AI provider (API call) ──→ GeneratedQuestion[]
                              │                       │
                              ▼                       ▼
                    InterrogativeReading     QuestionnaireBuilder
                    (questions per section)  (exam questions)
                              │                       │
                              │              ┌─ "Import from reading" path
                              │              ▼
                              │         questions table ──→ questionnaireItems
                              │                       │
                              ▼                       ▼
                          Dexie                   Dexie
                    (questions table)    (questionnaireItems)
                                                   │
                                           SM-2 engine ──→ reviewAttempts
                                                   │
                                      In-app badge / count
                                      (navigator.setAppBadge)
                                      + Periodic Background Sync
                                      (progressive enhancement)
```

## PWA Strategy

- **Service worker**: `vite-plugin-pwa` with Workbox. Static assets (JS/CSS/fonts) cache-first; AI API calls network-first; all other routes serve app shell.
- **Offline**: Dexie stores all study data; all flows except AI generation work offline. Offline indicator shown via navigator.onLine listener.
- **Review reminders (no push server)**: Push notifications cannot self-trigger without a backend server — `setTimeout` is killed when the tab closes. The app uses an **in-app badge/count** approach instead:
  - On app open, check due reviews and display a badge/count via `navigator.setAppBadge()` where supported (PWAs on desktop/mobile).
  - Show a "Reviews due" banner on the dashboard.
  - **Periodic Background Sync** (`navigator.periodicSync`) is used as progressive enhancement where the browser supports it — it can wake the service worker periodically to check for due reviews and update the badge. Not available on all platforms (Chrome on Android primarily).
  - **Limitation**: Without a backend push server, reviews cannot notify the user while the app is completely closed on most platforms. This is a documented design tradeoff for the client-only architecture.
- **SW update flow**: When a new service worker is detected (`updatefound` event / Workbox broadcast channel), show a "Nueva versión disponible" banner at the top of the layout on the next navigation (not mid-input). Tapping it triggers `skipWaiting()` and reloads.

## Content Security Policy

Include a `<meta http-equiv="Content-Security-Policy">` tag with at minimum `script-src 'self'` to mitigate XSS risk for API keys stored in localStorage. Encryption at rest via `crypto.subtle` is a future enhancement (noted in backlog).

## Mobile UX Requirements

- **Keyboard avoidance**: Use the `visualViewport` API to detect on-screen keyboard and scroll the active input into view. All text inputs must remain visible above the keyboard.
- **Touch targets**: All interactive elements (buttons, checkboxes, tab items) MUST be ≥44 px in at least one dimension (WCAG 2.5.5 minimum).
- **3-month rule**: If >90 days have elapsed since the last session for a subject (queried via `sessions` compound index `[subject+updatedAt]`), show the `StaleSubjectBanner` allowing the user to review their brain dump notes before answering spaced-retrieval questions. This is a UX relaxation (notes review before recall), not an SM-2 override — the algorithm's interval computation is unchanged.

## Design Tokens (from ui-ux-pro-max)

| Token | Value |
|-------|-------|
| Primary | `#7C3AED` (study purple) |
| Accent/CTA | `#059669` (correct green) |
| Background | `#FAF5FF` |
| Foreground | `#0F172A` |
| Destructive | `#DC2626` |
| Font | Baloo 2 (headings) + system sans-serif stack (body) |
| Touch targets | ≥44 px minimum in at least one dimension (WCAG 2.5.5) |
| Style | Micro-interactions: 150 ms transitions, gesture feedback, haptic on score |

**Dark mode: deferred.** All colors should be specified as CSS custom properties to enable future theming. Dark mode implementation is out of scope for v1.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | SM-2 algorithm, markdown converter, AI provider parsers, Dexie queries | Vitest |
| Integration | Full flow: upload → extract → convert → generate → session → review | React Testing Library |
| E2E | PWA installability, offline resilience, review badge flow | Playwright (light) |
| PWA audit | Lighthouse PWA score ≥ 90 | CI check via Lighthouse CI |

## Migration / Rollout

No migration required — greenfield. Feature flags not needed; single-user app. Dexie schema versioning (`db.version()`) provides forward-compatible upgrades.
