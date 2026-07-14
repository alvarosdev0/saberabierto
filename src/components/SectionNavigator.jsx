import { useNavigate, useParams } from 'react-router-dom';

/**
 * SectionNavigator — next/previous buttons + "X/N" progress indicator.
 *
 * Shows the user's position within a session's sections and allows
 * navigating forward/backward. Disabled states prevent out-of-bounds nav.
 *
 * @param {object} props
 * @param {{ id: number, title: string, order: number }[]} props.sections - All sections for the session
 * @param {number} props.currentSectionId - The currently active section's ID
 * @param {'read'|'brain-dump'} props.mode - Current study mode (used to build routes)
 */
export default function SectionNavigator({
  sections,
  currentSectionId,
  mode = 'read',
}) {
  const { id: sessionId } = useParams();
  const navigate = useNavigate();

  const currentIndex = sections.findIndex(
    (s) => String(s.id) === String(currentSectionId),
  );

  const total = sections.length;
  const current = currentIndex >= 0 ? currentIndex + 1 : 0;

  const isFirst = currentIndex <= 0;
  const isLast = currentIndex >= total - 1;

  const goTo = (index) => {
    const section = sections[index];
    if (!section) return;
    navigate(
      `/session/${sessionId}/section/${section.id}/${mode}`,
      { replace: true },
    );
  };

  const handlePrevious = () => {
    if (!isFirst) goTo(currentIndex - 1);
  };

  const handleNext = () => {
    if (!isLast) goTo(currentIndex + 1);
  };

  if (total === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Previous */}
      <button
        type="button"
        onClick={handlePrevious}
        disabled={isFirst}
        className="flex items-center justify-center w-10 h-10 rounded-lg border border-base-content/10 bg-base-100 text-base-content hover:bg-base-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        aria-label="Sección anterior"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Progress indicator */}
      <span className="text-sm font-medium text-base-content/70 tabular-nums min-w-[3rem] text-center">
        {current}/{total}
      </span>

      {/* Next */}
      <button
        type="button"
        onClick={handleNext}
        disabled={isLast}
        className="flex items-center justify-center w-10 h-10 rounded-lg border border-base-content/10 bg-base-100 text-base-content hover:bg-base-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        aria-label="Sección siguiente"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
