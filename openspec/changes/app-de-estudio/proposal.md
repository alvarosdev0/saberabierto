# Proposal: SaberAbierto — App de Estudio

## Intent

Build a mobile-first PWA that implements the Dot Dager study methodology: PDF text extraction → markdown conversion → AI question generation → interrogative reading → brain dump → questionnaire → spaced retrieval. Target: autodidactas reading non-fiction, one subject/book at a time.

## Scope

### In Scope
- PDF upload, page thumbnails for visual selection (range + individual pages), text extraction
- PDF memory released immediately after extraction (no heavy persistent viewer)
- Text → editable markdown conversion pipeline
- Multi-provider AI question generation (DeepSeek, OpenAI, Anthropic; user API key)
- Full methodology flow: interrogative reading, brain dump, questionnaire builder, spaced retrieval (SM-2)
- Local persistence via Dexie.js (IndexedDB)
- PWA with offline support + in-app review reminders (badge counts, dashboard banner, Periodic Background Sync as progressive enhancement)
- Home dashboard with study stats and session continuity
- Data export/import (JSON backup of all Dexie tables)
- Content Security Policy with `script-src 'self'` minimum

### Out of Scope
- Cloud sync / user accounts (deferred)
- Social features or sharing
- Automated AI evaluation of brain dumps (future)
- Multiple simultaneous subjects (deferred)
- Cloud-based AI (user's own key, no backend)

## Capabilities

### New Capabilities
- `pdf-processor`: PDF upload, thumbnail generation for visual page selection, text extraction, memory cleanup after processing
- `markdown-converter`: selected text → MD with editable preview
- `ai-question-generator`: multi-provider abstraction, API key management, question generation (keyword, methodological, combative)
- `study-session`: session lifecycle, sections, timer, sequential subject focus
- `interrogative-reading`: question formulation UI per question type
- `brain-dump`: free-form notes with outline markers
- `questionnaire-builder`: end-of-session exam question creation
- `spaced-retrieval`: SM-2 scheduling, in-app review reminders (badge, banner, Periodic Background Sync), review history
- `home-dashboard`: stats, next review due, continue session, gaps to revisit

### Modified Capabilities
None (greenfield — no existing specs).

## Approach

React SPA with Vite bundler, React Router (hash-based for PWA), Tailwind CSS v4. Dexie.js v4 wraps IndexedDB for all study data. pdfjs-dist lazy-loaded via dynamic `import()` exclusively for PDF processing — user sees page thumbnails for visual selection (virtualized: 8-10 visible at a time via Intersection Observer), text is extracted from chosen pages, then PDF memory is freed explicitly (`pdfDocument.destroy()` + `requestIdleCallback`). No heavy persistent PDF viewer. vite-plugin-pwa generates service worker and manifest. AI providers abstracted behind a common interface; API keys stored in localStorage (constructor-based injection to decouple providers from storage). Content Security Policy meta tag with `script-src 'self'` at minimum. SM-2 algorithm runs client-side; review reminders via in-app badge (`navigator.setAppBadge`) and Periodic Background Sync as progressive enhancement (no backend push server).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/` | New | React app: components, hooks, stores, routes |
| `public/` | New | Static assets, icons, manifest, service worker |
| `package.json` | New | React, Vite, Tailwind, Dexie, pdfjs-dist, vite-plugin-pwa |
| `openspec/config.yaml` | Modified | Project type: content/document → PWA app |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| pdfjs-dist ~3MB first load | High | Dynamic import on "Subir PDF" click; cached by service worker after first use; app startup always instant (~50KB) |
| PDF processing RAM spike (~80-150MB) | Medium | Process thumbnails page-by-page with yield between renders; free PDF document after extraction; app returns to ~30MB baseline |
| Mobile IndexedDB quotas (5-50MB) | Low | Dexie handles gracefully; test on low-end devices; offer JSON export as backup |
| API keys stored in localStorage | Medium | Warn user at setup; Content Security Policy meta tag with `script-src 'self'`; `crypto.subtle` encryption at rest as future enhancement |
| Service worker cache staleness | Low | vite-plugin-pwa handles cache-busting via Workbox |

## Rollback Plan

PWA rollback: update `version` field in service worker + deploy. Data rollback: Dexie schema versioning supports migration rollback. No server-side state to unwind.

## Dependencies

- None external. User provides own study PDF and AI API key.

## Success Criteria

- [ ] User uploads PDF, sees page thumbnails, selects pages, receives editable markdown
- [ ] PDF memory is freed after extraction; app returns to baseline RAM usage
- [ ] AI generates coherent questions from markdown (any configured provider)
- [ ] Full study flow works offline except AI generation
- [ ] Spaced retrieval tracks SM-2 history and shows in-app review reminders (badge, banner, Periodic Background Sync where supported)
- [ ] PWA passes Lighthouse PWA audit (installable)
