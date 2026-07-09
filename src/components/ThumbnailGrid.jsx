import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Virtual-scroll thumbnail grid for PDF page selection.
 *
 * Uses scroll-based visibility calculation to render only ~8-10 visible
 * thumbnails regardless of total page count. Each thumbnail is ~150 px tall.
 *
 * Selection modes:
 *   - Individual tap: toggles a single page
 *   - Range mode: tap start → tap end → all pages in between selected
 *
 * @param {object} props
 * @param {Array<{ pageNumber: number, url?: string }>} props.pages
 * @param {Set<number>} props.selectedPages
 * @param {(pageNumber: number) => void} props.onTogglePage
 * @param {(start: number, end: number) => void} props.onSelectRange
 * @param {(pageNumber: number) => void} [props.onNeedRender] - Called when a thumbnail enters viewport and needs rendering
 */
export default function ThumbnailGrid({
  pages,
  selectedPages,
  onTogglePage,
  onSelectRange,
  onNeedRender,
}) {
  const containerRef = useRef(null);

  const THUMBNAIL_HEIGHT = 150;
  const VISIBLE_COUNT = 10;

  const [visibleStart, setVisibleStart] = useState(0);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState(null);

  // Notify parent of pages that need rendering
  const notifiedRef = useRef(/** @type {Set<number>} */ (new Set()));

  // --- Scroll handler: compute visible range ---
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const itemHeight = THUMBNAIL_HEIGHT;
    const scrollTop = container.scrollTop;
    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
    setVisibleStart(startIdx);

    // Notify parent of newly visible pages that don't have URLs yet
    if (onNeedRender) {
      const visibleCount = Math.ceil(container.clientHeight / itemHeight) + 4;
      const endIdx = Math.min(pages.length, startIdx + visibleCount);

      for (let i = startIdx; i < endIdx; i++) {
        const pn = pages[i]?.pageNumber;
        if (pn && !notifiedRef.current.has(pn)) {
          notifiedRef.current.add(pn);
          onNeedRender(pn);
        }
      }
    }
  }, [pages, onNeedRender]);

  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    // Initial calculation on next tick so layout is settled
    requestAnimationFrame(handleScroll);

    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Reset notified set when pages change (new PDF loaded)
  useEffect(() => {
    notifiedRef.current.clear();
  }, [pages]);

  // --- Range selection: tap first page, then second ---
  const handlePageTap = useCallback(
    (pageNumber) => {
      if (rangeMode) {
        if (rangeStart === null) {
          setRangeStart(pageNumber);
        } else {
          const start = Math.min(rangeStart, pageNumber);
          const end = Math.max(rangeStart, pageNumber);
          onSelectRange(start, end);
          setRangeStart(null);
          setRangeMode(false);
        }
      } else {
        onTogglePage(pageNumber);
      }
    },
    [rangeMode, rangeStart, onTogglePage, onSelectRange],
  );

  const enableRangeMode = () => {
    setRangeMode(true);
    setRangeStart(null);
  };

  const cancelRangeMode = () => {
    setRangeMode(false);
    setRangeStart(null);
  };

  // --- Visible range ---
  const visibleEnd = Math.min(visibleStart + VISIBLE_COUNT + 4, pages.length);
  const visiblePages = pages.slice(visibleStart, visibleEnd);

  // Spacer heights for virtual scroll
  const topSpacerHeight = visibleStart * THUMBNAIL_HEIGHT;
  const bottomSpacerHeight =
    Math.max(0, pages.length - visibleEnd) * THUMBNAIL_HEIGHT;

  const selectedCount = selectedPages.size;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectRange(1, pages.length)}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            Seleccionar todo
          </button>
          <button
            type="button"
            onClick={() => {
              const all = Array.from(selectedPages);
              all.forEach((p) => onTogglePage(p));
            }}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            Deseleccionar todo
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!rangeMode ? (
            <button
              type="button"
              onClick={enableRangeMode}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-purple-300 text-purple-600 hover:bg-purple-50 transition-colors"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              Seleccionar rango
            </button>
          ) : (
            <button
              type="button"
              onClick={cancelRangeMode}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              Cancelar rango
            </button>
          )}

          <span className="text-sm text-gray-500">
            {selectedCount} de {pages.length} páginas
            {selectedCount > 0 && ' seleccionadas'}
          </span>
        </div>
      </div>

      {/* Range mode indicator */}
      {rangeMode && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          {rangeStart === null
            ? 'Toca la primera página del rango'
            : `Inicio: pág. ${rangeStart} — Ahora toca la última página del rango`}
        </div>
      )}

      {/* Virtual scroll container */}
      <div
        ref={containerRef}
        className="overflow-y-auto rounded-lg border border-gray-200 bg-white"
        style={{ height: `${VISIBLE_COUNT * THUMBNAIL_HEIGHT}px` }}
      >
        {/* Top spacer */}
        <div style={{ height: `${topSpacerHeight}px` }} />

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-2">
          {visiblePages.map((page) => {
            const isSelected = selectedPages.has(page.pageNumber);
            const isRangePending =
              rangeMode && rangeStart !== null && page.pageNumber === rangeStart;

            return (
              <ThumbnailItem
                key={page.pageNumber}
                page={page}
                isSelected={isSelected}
                isRangeStart={isRangePending}
                onTap={() => handlePageTap(page.pageNumber)}
              />
            );
          })}
        </div>

        {/* Bottom spacer */}
        <div style={{ height: `${bottomSpacerHeight}px` }} />
      </div>
    </div>
  );
}

/**
 * Single thumbnail item.
 */
function ThumbnailItem({ page, isSelected, isRangeStart, onTap }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className={`
        relative flex flex-col items-center rounded-md overflow-hidden
        border-2 transition-all duration-150
        ${isSelected
          ? 'border-purple-500 bg-purple-50 shadow-md'
          : isRangeStart
            ? 'border-amber-400 bg-amber-50'
            : 'border-transparent bg-gray-50 hover:border-gray-300'
        }
      `}
      style={{ minWidth: '44px', minHeight: '44px' }}
      aria-label={`Página ${page.pageNumber}${isSelected ? ' (seleccionada)' : ''}`}
      aria-pressed={isSelected}
    >
      {/* Thumbnail image */}
      <div
        className="w-full bg-gray-100 flex items-center justify-center overflow-hidden"
        style={{ height: '100px' }}
      >
        {page.url ? (
          <img
            src={page.url}
            alt={`Miniatura página ${page.pageNumber}`}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <svg
              className="w-6 h-6 text-gray-300 animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
            <span className="text-gray-400 text-xs">...</span>
          </div>
        )}
      </div>

      {/* Page number label */}
      <div className="w-full py-1 text-center text-xs font-medium text-gray-600 bg-gray-50">
        Pág. {page.pageNumber}
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-1 right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center shadow-sm">
          <svg
            className="w-3 h-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}
