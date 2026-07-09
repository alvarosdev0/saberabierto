## Exploration: App de Estudio (Metodología Dot Dager)

> **Nota histórica:** Esta exploración es anterior a las decisiones finales. El stack final es **React + Vite** (no Svelte), el esquema Dexie fue rediseñado (ver `design.md`), y la generación de preguntas por IA está incluida en el alcance inicial.

### Current State
Greenfield PWA project at `C:\Users\alvar\Desktop\saberabierto`. No code exists. The project initially started as a content/document project (video guide transcript), but the scope is expanding to build a mobile-first Progressive Web App implementing the Dot Dager study methodology. Stack decision so far: PWA, mobile-first, 100% offline-first. Design tools (ui-ux-pro-max v2.10.2, OpenPencil) are installed and available.

### Affected Areas
- No existing codebase — this creates the initial code structure
- `openspec/config.yaml` — will need updating from "content/document" to "PWA app"
- `openspec/specs/` — new main specs domain for the app
- Root directory — new project structure (`src/`, `public/`, `package.json`, etc.)

---

### A) Tech Stack Comparison

| Criteria | Option 1: Vanilla HTML + Tailwind + JS | Option 2: React + Vite + Tailwind | Option 3: Svelte + Vite + Tailwind |
|---|---|---|---|
| **Bundle size** | ~15KB (Tailwind CDN) + 0KB framework | ~45KB (React 19) + code | ~2KB (compiled Svelte runtime) + code |
| **Build step** | None | Required (Vite + JSX) | Required (Vite + Svelte compile) |
| **Component model** | None (manual DOM) | JSX components | Svelte components (compile-time) |
| **State management** | Manual (pub/event bus) | useState/useContext/ Zustand | Svelte stores (built-in) |
| **Routing** | Manual hash-router | React Router | svelte-spa-router or SvelteKit |
| **PWA support** | Manual workbox config | vite-plugin-pwa | vite-plugin-pwa |
| **Mobile performance** | Excellent (no framework) | Good (virtual DOM overhead) | Excellent (compile-to-vanilla, no VDOM) |
| **Learning curve** | Low | Medium | Low-Medium |
| **Ecosystem** | Any JS library | Largest | Smaller but growing |
| **Maintainability (8+ screens)** | Medium (manual patterns) | High (components + hooks) | High (components + reactive) |
| **PDF.js integration** | Works directly | Works (React wrapper) | Works directly in script |
| **Dev experience** | No HMR, manual refresh | Vite HMR, excellent DX | Vite HMR, excellent DX |
| **Long-term viability** | Always viable | Very high | High (used by Apple, Spotify) |

#### Recommendation: Option 3 — Svelte + Vite + Tailwind CSS

**Rationale:**
1. **Smallest footprint**: Svelte compiles components to vanilla JS at build time — no virtual DOM, no runtime overhead. Critical for mobile PWA where every KB matters. On a slow mobile connection, 2KB vs 45KB framework runtime is a meaningful difference.
2. **Reactive by default**: This app is form-heavy (questions, notes, questionnaires). Svelte's `let count = 0` reactivity means no useState/useEffect boilerplate — state changes automatically update the DOM.
3. **Built-in stores**: Shared state (current session, user progress) uses Svelte stores — no extra library needed.
4. **vite-plugin-pwa**: Drop-in service worker generation with workbox, web manifest generation, precaching.
5. **Mobile performance**: No VDOM diffing, smaller bundle, less memory pressure → smoother interactions on mid-range Android phones.
6. **SPA mode**: Use SvelteKit with `adapter-static` for SPA fallback, or pure Vite + Svelte with `svelte-spa-router`.

**Concrete setup:**
```bash
npm create vite@latest estudio-app -- --template svelte
cd estudio-app
npm install
npm install -D tailwindcss @tailwindcss/vite vite-plugin-pwa
npm install dexie pdfjs-dist svelte-spa-router
```

**Counter-argument against vanilla**: 8+ screens with interconnected state (session → sections → questions → notes → questionnaires → review history) would require manual state management patterns in vanilla JS. A framework prevents spaghetti code as complexity grows.

---

### B) PDF Text Extraction (Client-side / Offline)

**Recommended: Mozilla PDF.js v4.x + FileReader pipeline**

```
[User selects PDF] → [FileReader → ArrayBuffer] → [pdfjs.getDocument()] → 
[Loop pages → page.getTextContent()] → [Store text in Dexie IndexedDB table]
```

**Details:**
- **pdfjs-dist** npm package (v4.8.69 latest): The official distribution of PDF.js for bundlers.
- **Pipeline**: Use the local `File` API via `<input type="file">` → `FileReader.readAsArrayBuffer()` → pass buffer to `pdfjsLib.getDocument()`.
- **Offline**: PDF.js is fully self-contained — no server calls. Once the app is cached by the service worker, everything works offline.
- **Bundle size**: pdfjs-dist is ~3MB gzipped. Mitigation:
  - Use dynamic `import()` so it only loads when the user taps "Upload PDF"
  - Consider `pdfjs-dist/legacy/build/pdf.mjs` for smaller footprint
  - Alternatively use `pdf-lib` (lighter, but less accurate text extraction)
- **Storage**: Extracted text stored in Dexie `pdf_cache` table so re-reading the same PDF doesn't re-parse.

**Alternative: pdf-lib** — Lighter (~500KB) but text extraction is less reliable. Use PDF.js for correctness.

---

### C) Local Storage / Database

**Recommended: Dexie.js v4.x over IndexedDB**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **localStorage** | Simple API, synchronous | ~5MB limit, string-only, no queries | ❌ Too limited |
| **IndexedDB (raw)** | No deps, object store, indexes | Very verbose API, callback-heavy, error-prone | ❌ Painful DX |
| **Dexie.js** | Clean Promise API, schema versioning, indexes, ~30KB gzipped | Small dependency | ✅ **RECOMMENDED** |
| **OPFS** | Fast for binary files, modern | Chromium-only partial support on mobile, async but complex | ❌ Premature |

**Dexie schema design:**

```javascript
const db = new Dexie('EstudioApp');

db.version(1).stores({
  sessions: '++id, createdAt, updatedAt',
  sections: '++id, sessionId, order',
  questions: '++id, sectionId, sessionId, type', // type: 'keyword'|'methodological'|'combative'
  notes: '++id, sectionId, sessionId',
  questionnaires: '++id, sessionId, createdAt',
  questionnaireItems: '++id, questionnaireId, order',
  reviewAttempts: '++id, questionnaireItemId, date, score',
  pdfCache: '++id, originalName, dateCached',
});
```

**Key point**: IndexedDB persists across service worker updates and survives cache clears — critical for the spaced retrieval loop that spans months.

---

### D) Architecture — Screens & Data Flow

#### Screen Map

```
┌─────────────────────────────────────────────────┐
│  Home / Dashboard                                │
│  • Continue session (last active)                │
│  • Next review due (spaced retrieval alert)      │
│  • Quick stats (sessions completed, cards due)   │
│  • "New Study Session" FAB                       │
└────────────────┬────────────────────────────────┘
                 │ start session
                 ▼
┌─────────────────────────────────────────────────┐
│  Text Input                                      │
│  • Paste text from clipboard                      │
│  • Upload PDF (→ PDF.js extraction)              │
│  • Title the section (~20min read)               │
└────────────────┬────────────────────────────────┘
                 │ text ready
                 ▼
┌─────────────────────────────────────────────────┐
│  Question Formulation (Lectura Interrogativa)     │
│  • Guided UI: 3 question types                    │
│    - Keyword: capture key terms as questions      │
│    - Methodological: "what evidence supports X?"  │
│    - Combative: "do they have a point?"           │
│  • User writes their own questions                 │
│  • Scan text alongside (read-only preview)       │
└────────────────┬────────────────────────────────┘
                 │ questions ready
                 ▼
┌─────────────────────────────────────────────────┐
│  Reading Mode                                     │
│  • Full text displayed                            │
│  • Questions pinned as sticky overlay/panel       │
│  • Tap a question to mark "answered"             │
│  • Timer optional                                 │
└────────────────┬────────────────────────────────┘
                 │ done reading
                 ▼
┌─────────────────────────────────────────────────┐
│  Brain Dump / Notes                               │
│  • Free-form text area                             │
│  • Outline method markers (I, II, A, B, i, ii)   │
│  • Auto-detect knowledge gaps (user flags them)  │
│  • Per-section or per-session                     │
└────────────────┬────────────────────────────────┘
                 │ repeat for each section
                 │ (or end session when done)
                 ▼
┌─────────────────────────────────────────────────┐
│  Questionnaire Builder (End of Session)           │
│  • Create exam-style questions                    │
│  • Guidance: "Force elaboration, opinion,         │
│    or application to new contexts"                │
│  • Save for spaced retrieval                      │
└────────────────┬────────────────────────────────┘
                 │ session ends
                 ▼
           ┌─────┴─────┐
           ▼           ▼
    (next session)  (later)
           │           │
           ▼           ▼
┌──────────────────────┐  ┌─────────────────────────────┐
│  Spaced Review        │  │  Study History               │
│  • Show questionnaire │  │  • Calendar/session list     │
│  • User answers from  │  │  • Per-session detail        │
│    memory (no notes)  │  │  • Review stats over time    │
│  • Self-score:        │  │  • Streak tracking            │
│    correct / partial  │  │                              │
│    / forgot           │  └─────────────────────────────┘
│  • Schedule next      │
│    review via SM-2    │
│  • If >3 months →     │
│    can check notes    │
└──────────────────────┘
```

#### Data Flow

```
Session ──┬── Section[1] ──┬── Questions (keyword, methodological, combative)
           │                ├── Notes (brain dump)
           │                └── Knowledge gaps
           │
           ├── Section[2] ──┬── Questions
           │                ├── Notes
           │                └── Knowledge gaps
           │
           └── Questionnaire ──┬── Q1 (elaboration)
                               ├── Q2 (application)
                               ├── Q3 (opinion)
                               └── → ReviewAttempts[]

ReviewAttempt {
  questionnaireItemId,
  date,
  score: 0|1|2|3  (SM-2 scale),
  nextReviewDate  (calculated via SM-2)
}
```

#### Spaced Retrieval Algorithm

Use a simplified **SM-2** algorithm (from SuperMemo):
- First review: 1 day
- If correct: interval doubles after second review (1→4→8→16→32 days...)
- If partially correct: repeat at same interval
- If forgot: reset to 1 day
- Cap at 6 months max interval
- The "3-month rule": if next review > 3 months since last study, allow checking notes before answering

---

### E) AI Integration (Future)

**For now**: 100% offline. User creates their own questions and evaluates their own brain dumps. This is intentional per the methodology — the act of formulating questions IS part of learning.

**Architecture hook for future AI:**
- Plugin-style interface: the question formulation and brain dump evaluation are functions that accept text + user input and return results
- An "AI provider" adapter can be injected later:
  ```javascript
  // adapter interface (future)
  class AIProvider {
    async generateQuestions(text) { ... }
    async evaluateBrainDump(text, notes) { ... }
  }
  ```
- The Dexie schema already stores raw text and user input — an AI provider could process it
- WebLLM (webllm.mlc.ai) or Ollama bridge via local server are both viable future options
- No cloud dependency should ever be required

---

### F) Design System Strategy (ui-ux-pro-max + OpenPencil)

**Phase split for design and implementation:**

1. **Design phase** (before or during sdd-design):
   - Run `ui-ux-pro-max` with `--design-system` to get product-specific recommendations:
     ```bash
     python3 .opencode/skills/ui-ux-pro-max/scripts/search.py \
       "study tool productivity mobile-first minimal learning" \
       --design-system -p "SaberAbierto"
     ```
   - This yields: pattern, style, colors, typography, effects, anti-patterns
   - Save as `design-system/MASTER.md` with `--persist`
   - Generate page-specific overrides for key screens (dashboard, reading, notes)

2. **Visual mockups** (during sdd-design):
   - Use OpenPencil to create screen-level mockups
   - Create a new `.pen` document per screen or a single multi-page document
   - Iterate on visual design before writing any code

3. **Implementation** (during sdd-apply):
   - Translate design tokens to Tailwind config
   - Build components matching the mockups
   - Use ui-ux-pro-max `--domain ux` for UX validation before shipping

**Available project design skills** (from skill registry):
- `ui-ux-pro-max` — Design intelligence (styles, colors, typography, UX guidelines)
- `design-system` — Token architecture, component specs
- `ui-styling` — Tailwind/shadcn UI implementation
- `design` — Comprehensive brand-to-UI pipeline

---

### Recommendation Summary

| Decision | Choice | Why |
|----------|--------|-----|
| **Framework** | Svelte + Vite | Smallest bundle, reactive, best mobile PWA perf |
| **Styling** | Tailwind CSS v4 | Utility-first, mobile-optimized, tree-shakeable |
| **PWA layer** | vite-plugin-pwa | Drop-in SW + manifest generation |
| **Routing** | svelte-spa-router | Lightweight hash-based router for SPA |
| **Storage** | Dexie.js v4 | Clean IndexedDB wrapper, schema migrations |
| **PDF extraction** | pdfjs-dist v4 | Gold standard for client-side PDF parsing |
| **Offline** | Service worker (workbox) + Dexie | All data in IndexedDB, app shell cached |
| **Design tool** | OpenPencil + ui-ux-pro-max | Design intelligence → mockups → code |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **pdfjs-dist bundle size (~3MB)** | Certain | Medium | Dynamic import on demand, code-split from main bundle |
| **Svelte learning curve for non-JS dev** | Medium | Low | Svelte is simpler than React; docs are excellent |
| **Mobile browser IndexedDB limits** | Low | Medium | Dexie handles storage quota gracefully; test on low-end devices |
| **SM-2 algorithm complexity** | Low | Low | Simplified version is ~50 lines; can start with fixed intervals |
| **Offline-first means no cloud backup** | Medium | Medium | Can add optional file export (JSON download) as backup |
| **Service worker caching stale assets** | Low | Low | vite-plugin-pwa handles cache-busting via workbox |
| **User must provide own study material** | None | — | Core to methodology: user reads what they need to study |

### Ready for Proposal
**Yes.** This exploration is thorough enough to proceed to `sdd-propose`.

The orchestrator should tell the user:
1. Stack: Svelte + Vite + Tailwind CSS v4 was chosen as the best fit (smallest bundle, best mobile PWA perf, reactive for form-heavy UI)
2. Storage: Dexie.js over IndexedDB for all session/notes/question/questionnaire data
3. PDF extraction: pdfjs-dist (lazy-loaded to keep initial bundle small)
4. Architecture: 8 screens mapped with clear data flow between them
5. Design: ui-ux-pro-max for design system → OpenPencil for mockups → Tailwind for implementation
6. AI integration deferred: architecture is designed to add an AI provider plugin later

Proceed to `sdd-propose` to create the formal proposal with scope, approach, and delivery strategy.
