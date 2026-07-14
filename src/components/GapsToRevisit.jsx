import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heading, Text } from '@ninna-ui/primitives';
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
      <div className="bg-base-100 rounded-xl border border-base-content/10 p-4 animate-pulse">
        <div className="h-3 w-24 bg-base-content/10 rounded mb-3" />
        <div className="h-4 w-full bg-base-content/10 rounded mb-2" />
        <div className="h-4 w-3/4 bg-base-content/10 rounded" />
      </div>
    );
  }

  if (gaps.length === 0) return null;

  return (
    <div className="bg-base-100 rounded-xl border border-base-content/10 divide-y divide-base-content/10">
      <div className="px-4 py-3 bg-base-200 rounded-t-xl">
        <Text size="xs" className="text-base-content/50 font-medium uppercase tracking-wide">
          Lagunas por revisar ({gaps.length})
        </Text>
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
          className="w-full text-left px-4 py-3 hover:bg-primary/10 transition-colors flex items-start gap-3"
          style={{ minHeight: 'var(--touch-target-min)' }}
        >
          <span className="text-sm mt-0.5 flex-shrink-0">🔍</span>
          <div className="min-w-0">
            <Text size="sm" className="text-base-content leading-snug line-clamp-2">
              {gap.gapText}
            </Text>
            <Text size="xs" className="text-base-content/40 mt-1 truncate">
              {gap.sessionSubject} · {gap.sectionTitle}
            </Text>
          </div>
        </button>
      ))}
    </div>
  );
}
