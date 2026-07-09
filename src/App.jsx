import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Layout from './components/Layout.jsx';

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

export default function App() {
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
