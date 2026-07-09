import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * GapHighlighter — lets the user select text and mark it as a knowledge gap.
 *
 * Wrap this around a textarea. When the user selects text, a floating button
 * appears below the selection. Clicking it records the gap position + text.
 *
 * @param {object} props
 * @param {React.RefObject<HTMLTextAreaElement>} props.textareaRef - Ref to the textarea
 * @param {{ text: string, start: number, end: number }[]} props.gaps - Current gaps
 * @param {(gap: { text: string, start: number, end: number }) => void} props.onGapMark - Called when a new gap is marked
 * @param {(index: number) => void} [props.onGapRemove] - Called to remove a gap
 */
export default function GapHighlighter({
  textareaRef,
  gaps,
  onGapMark,
  onGapRemove,
}) {
  const [selection, setSelection] = useState(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const popoverTimeout = useRef(null);

  // Listen for selection events on the textarea
  const handleMouseUp = useCallback(() => {
    // Small delay so the browser finishes updating the selection
    clearTimeout(popoverTimeout.current);
    popoverTimeout.current = setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;

      if (start === end || start == null || end == null) {
        setSelection(null);
        return;
      }

      const text = el.value.substring(start, end);
      if (!text.trim()) {
        setSelection(null);
        return;
      }

      setSelection({ text, start, end });

      // Position popover near the selection
      // Use a rough position below the textarea or near the cursor
      const rect = el.getBoundingClientRect();
      setPopoverPos({
        x: rect.left + (rect.width / 2),
        y: rect.bottom + 4,
      });
    }, 150);
  }, [textareaRef]);

  const handleMarkGap = useCallback(() => {
    if (!selection) return;
    onGapMark(selection);
    setSelection(null);

    // Clear the text selection
    const el = textareaRef.current;
    if (el) {
      el.setSelectionRange(selection.end, selection.end);
    }
  }, [selection, onGapMark, textareaRef]);

  // Attach mouseup listener to the textarea via ref
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.addEventListener('mouseup', handleMouseUp);
    // Also listen for keyup (keyboard selection via Shift+Arrow)
    el.addEventListener('keyup', handleMouseUp);

    return () => {
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('keyup', handleMouseUp);
    };
  }, [handleMouseUp, textareaRef]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearTimeout(popoverTimeout.current);
  }, []);

  /** Check if a position range is already marked as a gap. */
  const isAlreadyGap = (start, end) => {
    return gaps.some(
      (g) => g.start === start && g.end === end,
    );
  };

  return (
    <div className="relative">
      {/* Floating popover */}
      {selection && !isAlreadyGap(selection.start, selection.end) && (
        <div
          className="fixed z-50 shadow-lg"
          style={{
            left: `${popoverPos.x}px`,
            top: `${popoverPos.y}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <button
            type="button"
            onClick={handleMarkGap}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 shadow-md transition-colors whitespace-nowrap"
            style={{ minHeight: 'var(--touch-target-min)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Marcar como laguna
          </button>
        </div>
      )}

      {/* Selection dismissed overlay — clicking anywhere clears the popover */}
      {selection && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setSelection(null)}
        />
      )}

      {/* Rendered gaps list (if any) below the textarea */}
      {gaps.length > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-2">
            Laguna{gaps.length !== 1 ? 's' : ''} detectada{gaps.length !== 1 ? 's' : ''} ({gaps.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {gaps.map((gap, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 text-xs text-amber-700"
              >
                <span className="truncate flex-1 italic">
                  &ldquo;{gap.text.length > 60 ? gap.text.substring(0, 60) + '…' : gap.text}&rdquo;
                </span>
                {onGapRemove && (
                  <button
                    type="button"
                    onClick={() => onGapRemove(i)}
                    className="flex-shrink-0 text-amber-400 hover:text-red-500 transition-colors"
                    style={{ minHeight: '24px', minWidth: '24px' }}
                    aria-label="Eliminar laguna"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
