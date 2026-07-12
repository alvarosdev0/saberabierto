import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import db from '../services/db.js';

/**
 * GapsToRevisit — list of flagged knowledge gaps from descarga de ideas notes.
 *
 * Per design §HomeDashboard:
 *   List flagged gaps from notes.hasGaps index.
 *   Link to descarga de ideas notes for each gap.
 *
 * Each gap entry shows:
 *   - The gap text (first 80 chars)
 *   - Source section title
 *   - Link to the descarga de ideas page for that section
 */
export default function GapsToRevisit() {
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Query notes with hasGaps = 1 (indexed boolean)
        const gapNotes = await db.notes
          .where('hasGaps')
          .equals(1)
          .toArray();

        if (cancelled || gapNotes.length === 0) {
          if (!cancelled) setGaps([]);
          return;
        }

        // Enrich with section titles and session IDs
        const enriched = await Promise.all(
          gapNotes.map(async (note) => {
            const section = await db.sections.get(note.sectionId);
            let session = null;
            if (section?.sessionId) {
              session = await db.sessions.get(section.sessionId);
            }

            // Parse gaps JSON array
            let gapTexts = [];
            try {
              if (typeof note.gaps === 'string') {
                gapTexts = JSON.parse(note.gaps);
              } else if (Array.isArray(note.gaps)) {
                gapTexts = note.gaps;
              }
            } catch {
              gapTexts = [];
            }

            return {
              noteId: note.id,
              sectionId: note.sectionId,
              sessionId: section?.sessionId,
              sectionTitle: section?.title || 'Sección desconocida',
              sessionSubject: session?.subject || 'Sesión',
              gaps: gapTexts,
            };
          }),
        );

        // Flatten: one entry per gap text
        const flat = [];
        for (const entry of enriched) {
          for (const gapText of entry.gaps) {
            if (gapText && typeof gapText === 'string' && gapText.trim()) {
              flat.push({
                ...entry,
                gapText: gapText.trim(),
              });
            }
          }
        }

        if (!cancelled) setGaps(flat);
      } catch (err) {
        console.warn('GapsToRevisit load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default p-4 animate-pulse">
        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (gaps.length === 0) return null;

  return (
    <div className="bg-white dark:bg-surface rounded-xl border border-gray-200 dark:border-default divide-y divide-gray-100">
      <div className="px-4 py-3 bg-gray-50 dark:bg-muted rounded-t-xl">
        <p className="text-xs text-gray-500 dark:text-muted font-medium uppercase tracking-wide">
          Lagunas por revisar ({gaps.length})
        </p>
      </div>
      {gaps.map((gap, idx) => (
        <button
          key={`${gap.noteId}-${idx}`}
          type="button"
          onClick={() => {
            if (gap.sessionId && gap.sectionId) {
              navigate(`/session/${gap.sessionId}/section/${gap.sectionId}/brain-dump`);
            }
          }}
          className="w-full text-left px-4 py-3 hover:bg-purple-50 transition-colors flex items-start gap-3"
          style={{ minHeight: 'var(--touch-target-min)' }}
        >
          <span className="text-sm mt-0.5 flex-shrink-0">🔍</span>
          <div className="min-w-0">
            <p className="text-sm text-gray-800 dark:text-foreground leading-snug line-clamp-2">
              {gap.gapText}
            </p>
            <p className="text-xs text-gray-400 mt-1 truncate">
              {gap.sessionSubject} · {gap.sectionTitle}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
