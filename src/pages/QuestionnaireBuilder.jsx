import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import db from '../services/db.js';

/**
 * QuestionnaireBuilder — auto-importa preguntas de la lectura al cuestionario
 * y redirige al repaso espaciado. Sin interacción del usuario.
 *
 * Route: /session/:id/questionnaire
 */
export default function QuestionnaireBuilder() {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function autoImport() {
      try {
        // 1. Load all sections for this session
        const sections = await db.sections.where('sessionId').equals(Number(sessionId)).sortBy('order');

        // 2. Find or create questionnaire
        let q = await db.questionnaires.where('sessionId').equals(Number(sessionId)).first();
        if (!q) {
          const qId = await db.questionnaires.add({ sessionId: Number(sessionId), createdAt: new Date() });
          q = { id: qId };
        }

        // 3. Load existing items to avoid duplicates
        const existingItems = await db.questionnaireItems.where('questionnaireId').equals(q.id).toArray();
        const existingQuestionIds = new Set(
          existingItems.filter((i) => i.sourceQuestionId).map((i) => i.sourceQuestionId)
        );

        // 4. Load all questions from all sections
        let importedCount = 0;
        for (const sec of sections) {
          const questions = await db.questions.where('sectionId').equals(sec.id).toArray();
          const toImport = [];

          for (const qRef of questions) {
            if (existingQuestionIds.has(qRef.id)) continue; // already imported
            toImport.push({
              questionnaireId: q.id,
              sectionId: sec.id,
              questionText: qRef.text,
              source: 'reading',
              sourceQuestionId: qRef.id,
            });
          }

          if (toImport.length > 0) {
            await db.questionnaireItems.bulkAdd(toImport);
            importedCount += toImport.length;
          }
        }

        // 5. Navigate to review
        if (!cancelled) {
          navigate(`/review/${q.id}`, { replace: true });
        }
      } catch (err) {
        console.error('Error auto-importing questions:', err);
        if (!cancelled) {
          navigate('/', { replace: true });
        }
      }
    }

    autoImport();
    return () => { cancelled = true; };
  }, [sessionId, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={24} className="animate-spin text-purple-600" aria-hidden="true" />
        <p className="text-gray-500 text-sm">Preparando cuestionario...</p>
      </div>
    </div>
  );
}
