import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import Layout from './components/Layout.jsx';
import db from './services/db.js';

// Code-split page components for smaller initial bundle (~50 KB)
const Home = lazy(() => import('./pages/Home.jsx'));
const PDFUpload = lazy(() => import('./pages/PDFUpload.jsx'));
const MarkdownEditor = lazy(() => import('./pages/MarkdownEditor.jsx'));
const InterrogativeReading = lazy(() => import('./pages/InterrogativeReading.jsx'));
const BrainDump = lazy(() => import('./pages/BrainDump.jsx'));
const QuestionnaireBuilder = lazy(() => import('./pages/QuestionnaireBuilder.jsx'));
const SpacedRetrieval = lazy(() => import('./pages/SpacedRetrieval.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
      <p className="text-gray-400">Cargando...</p>
    </div>
  );
}

/**
 * Count due reviews for app badge.
 *
 * Per design §PWA Strategy:
 *   On app open, check due reviews and display a badge/count via
 *   navigator.setAppBadge() where supported (PWAs on desktop/mobile).
 *   Graceful fallback on unsupported browsers.
 *
 * @returns {Promise<number>} Count of unique questionnaireItems due for review
 */
async function countDueReviews() {
  try {
    const items = await db.questionnaireItems.toArray();
    if (items.length === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let due = 0;
    for (const item of items) {
      const latest = await db.reviewAttempts
        .where('questionnaireItemId')
        .equals(item.id)
        .reverse()
        .sortBy('reviewedAt');

      if (latest.length === 0) {
        due++; // Never reviewed
      } else {
        const nextDate = new Date(latest[0].nextReview);
        if (nextDate <= today) due++;
      }
    }

    return due;
  } catch {
    return 0;
  }
}

export default function App() {
  // ── App badge (progressive enhancement) ──────────────────────────────────
  useEffect(() => {
    async function updateBadge() {
      if (!('setAppBadge' in navigator)) return;

      try {
        const count = await countDueReviews();
        if (count > 0) {
          await navigator.setAppBadge(count);
        } else if ('clearAppBadge' in navigator) {
          await navigator.clearAppBadge();
        }
      } catch {
        // Silently fail — badge is progressive enhancement
      }
    }

    updateBadge();
  }, []);

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<PDFUpload />} />
          <Route path="/session/:id/section/:sectionId/review-md" element={<MarkdownEditor />} />
          <Route path="/session/:id/section/:sectionId/read" element={<InterrogativeReading />} />
          <Route path="/session/:id/section/:sectionId/brain-dump" element={<BrainDump />} />
          <Route path="/session/:id/questionnaire" element={<QuestionnaireBuilder />} />
          <Route path="/review" element={<SpacedRetrieval />} />
          <Route path="/review/:questionnaireId" element={<SpacedRetrieval />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
