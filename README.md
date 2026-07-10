# SaberAbierto

**PWA de estudio que implementa la metodología Dot Dager:** lectura interrogativa, brain dump, cuestionarios y repaso espaciado (SM-2). Sin servidor, sin registro, 100% offline.

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=reactrouter&logoColor=white)
![Dexie](https://img.shields.io/badge/Dexie.js-2D3748?style=for-the-badge&logo=indexeddb&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)

---

## Quick start

```bash
npm install
npm run dev      # → http://localhost:5173
npm test         # 142 tests
npm run build    # → dist/ (PWA instalable)
```

---

## Flujo de estudio

```
1. SUBIR PDF          2. EXTRAER TEXTO        3. LEER + PREGUNTAR
┌─────────────┐      ┌──────────────┐       ┌──────────────────────┐
│ FileDropzone │─────→│ MarkdownEditor│─────→│ InterrogativeReading │
│ Thumbnails   │      │ Editar / OK   │       │ Split pane:           │
│ Seleccionar  │      │               │       │ MD + preguntas x 3   │
└─────────────┘      └──────────────┘       └──────────┬───────────┘
                                                        │ ↕ ModeSwitch
                                                        ▼
                                              ┌──────────────────────┐
                                              │ BrainDump             │
                                              │ Notas + lagunas       │
                                              └──────────┬───────────┘
                                                         │
                  4. CUESTIONARIO          5. REPASO ESPACIADO
                  ┌──────────────┐         ┌──────────────────┐
                  │ Questionnaire │←───────│ SpacedRetrieval   │
                  │ Manual / IA   │         │ Flip-card         │
                  │ Imp. lectura  │         │ Score 0-1-2-3     │
                  └──────────────┘         │ SM-2 algorithm    │
                                           └──────────────────┘
```

---

## Capacidades

| Capacidad | Qué hace |
|-----------|----------|
| **PDF upload** | Drag & drop, thumbnails virtualizados, selección por rango/página |
| **Extracción de texto** | pdfjs-dist lazy-loaded, texto → markdown, memoria liberada post-extracción |
| **Editor markdown** | Previsualización, edición, confirmación → crea sesión |
| **Lectura interrogativa** | Panel dividido: texto + 3 tipos de pregunta (Keyword, Methodological, Combative) |
| **Brain dump** | Notas de formato libre, marcadores de esquema, detección de lagunas |
| **Generación con IA** | 3 proveedores: DeepSeek, OpenAI, Anthropic. Tu propia API key. |
| **Cuestionarios** | Preguntas manuales, importadas de IA o de la lectura |
| **Repaso espaciado** | SM-2: olvidé (0) / parcial (1) / correcto (2) / perfecto (3). Cap de 6 meses. |
| **Dashboard** | Sesión activa, stats, próximos repasos, lagunas pendientes |
| **PWA** | Instalable, offline, badge de repasos pendientes |

---

## Tech stack

| Capa | Tecnología |
|------|-----------|
| Framework | React 19 |
| Bundler | Vite 6 |
| Estilos | Tailwind CSS v4 |
| Ruteo | React Router 7 (hash) |
| Persistencia | Dexie.js 4 (IndexedDB) |
| PDF | pdfjs-dist 6 (lazy-loaded) |
| PWA | vite-plugin-pwa (Workbox) |
| Tests | Vitest + @testing-library/react |

---

## Estructura del proyecto

```
src/
├── components/     # 15 componentes reutilizables
│   ├── Layout      # Nav + PWA update banner + offline indicator
│   ├── Timer       # Cronómetro count-up
│   ├── ModeSwitch  # Tab Lectura ↔ Brain Dump
│   ├── ScoreSelector, QuestionList, SectionNavigator
│   ├── GapHighlighter, StaleSubjectBanner
│   ├── QuickStats, ReviewCountdown, ReviewsDueBanner, GapsToRevisit
│   └── FileDropzone, ThumbnailGrid, ExtractionProgress, MarkdownEditor
├── pages/          # 9 rutas
│   ├── Home        # Dashboard
│   ├── PDFUpload   # Subida + extracción
│   ├── MarkdownEditor, Settings
│   ├── InterrogativeReading, BrainDump
│   ├── QuestionnaireBuilder, SpacedRetrieval
│   └── ReviewSession
├── hooks/          # useSession, useSections, useKeyboardAvoidance
├── services/       # db (Dexie), sm2, ai/ (3 providers), pdf
├── lib/            # markdown-converter, split-markdown
├── test/           # 142 tests
└── App.jsx         # Root: Router + PWA lifecycle
```

---

## Pruebas

```bash
npm test                    # 142 tests · 7 suites · ~5s
npx vitest --ui             # UI interactiva
npx vitest run src/services/sm2.test.js  # Solo tests SM-2
```

| Suite | Tests | Cubre |
|-------|-------|-------|
| SM-2 | 28 | Scores 0-3, caps, reset, fechas |
| Markdown converter | 26 | Headings, lists, cleanup |
| AI parsers | 46 | parseAIJSON, retry, errores, tokens |
| Dexie queries | 13 | Sesiones, repasos, gaps |
| Integración | 7 | Flujo completo RTL |
| Offline | 8 | Sin conexión, reconexión |
| Edge cases | 14 | PDF vacío, 401, 5xx, 0 preguntas |

---

## Construido con SDD

Este proyecto se desarrolló con **Spec-Driven Development (SDD)**: 7 fases, 65 tareas, implementación por fases con PRs encadenados.

Los artefactos SDD están en [`openspec/`](openspec/):
- [`proposal.md`](openspec/changes/app-de-estudio/proposal.md)
- [`design.md`](openspec/changes/app-de-estudio/design.md)
- [`tasks.md`](openspec/changes/app-de-estudio/tasks.md)
- Especificaciones detalladas en [`openspec/specs/`](openspec/specs/)

---

## Licencia

MIT
