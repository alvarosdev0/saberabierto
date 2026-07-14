import { useState, useEffect, useCallback, useRef } from 'react';

const BATCH_SIZE = 20;

/**
 * Thumbnail grid with "Ver más" pagination.
 *
 * Shows thumbnails in batches of {BATCH_SIZE}. Click "Ver más"
 * to load the next batch. No infinite scroll — you control the load.
 *
 * @param {object} props
 * @param {Array<{ pageNumber: number, url?: string }>} props.pages
 * @param {Set<number>} props.selectedPages
 * @param {(pageNumber: number) => void} props.onTogglePage
 * @param {(start: number, end: number) => void} props.onSelectRange
 * @param {(pageNumber: number) => void} [props.onNeedRender] - Called when a thumbnail enters viewport
 * @param {number} [props.jumpToPage] - When set, loads enough batches to make this page visible
 */
export default function ThumbnailGrid({
  pages,
  selectedPages,
  onTogglePage,
  onSelectRange,
  onNeedRender,
  jumpToPage,
}) {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  // When jumpToPage changes, auto-load enough batches to make it visible
  useEffect(() => {
    if (jumpToPage && jumpToPage > 0 && jumpToPage <= pages.length) {
      setVisibleCount((prev) => {
        const needed = Math.ceil(jumpToPage / BATCH_SIZE) * BATCH_SIZE;
        return Math.max(prev, Math.min(needed, pages.length));
      });
    }
  }, [jumpToPage, pages.length]);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState(null);
  const renderedRef = useRef(/** @type {Set<number>} */ (new Set()));
  const containerRef = useRef(null);

  const loadedPages = pages.slice(0, visibleCount);
  const hasMore = visibleCount < pages.length;
  const selectedCount = selectedPages.size;

  // Notify parent of pages that need thumbnail rendering
  useEffect(() => {
    loadedPages.forEach((p) => {
      if (p && !renderedRef.current.has(p.pageNumber)) {
        renderedRef.current.add(p.pageNumber);
        onNeedRender?.(p.pageNumber);
      }
    });
  }, [loadedPages, onNeedRender]);

  // Reset rendered set when pages change (new PDF loaded)
  useEffect(() => {
    renderedRef.current.clear();
  }, [pages]);

  // --- Range selection ---
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

  const loadMore = () => {
    setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, pages.length));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectRange(1, pages.length)}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
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
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-base-200 text-base-content/70 hover:bg-base-300 transition-colors"
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
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              Seleccionar rango
            </button>
          ) : (
            <button
              type="button"
              onClick={cancelRangeMode}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              Cancelar rango
            </button>
          )}

          <span className="text-sm text-base-content/50">
            {selectedCount} de {pages.length} páginas
            {selectedCount > 0 && ' seleccionadas'}
          </span>
        </div>
      </div>

      {/* Range mode indicator */}
      {rangeMode && (
        <div className="px-3 py-2 bg-warning/10 border border-warning/30 rounded-md text-sm text-warning">
          {rangeStart === null
            ? 'Toca la primera página del rango'
            : `Inicio: pág. ${rangeStart} — Ahora toca la última página del rango`}
        </div>
      )}

      {/* Thumbnail grid */}
      <div
        ref={containerRef}
        className="rounded-lg border border-base-content/10 bg-base-100 p-2"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {loadedPages.map((page) => {
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
      </div>

      {/* Ver más button */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            className="w-full max-w-xs px-4 py-3 text-sm font-medium rounded-lg border-2 border-dashed border-primary/30 text-primary hover:bg-primary/10 hover:border-primary transition-colors"
            style={{ minHeight: '44px' }}
          >
            Ver más ({visibleCount} de {pages.length})
          </button>
        </div>
      )}
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
        border-2 transition-[border-color,background-color,box-shadow] duration-150
        ${isSelected
          ? 'border-primary bg-primary/10 shadow-md'
          : isRangeStart
            ? 'border-warning bg-warning/10'
            : 'border-transparent bg-base-200 hover:border-base-300'
        }
      `}
      style={{ minWidth: '44px', minHeight: '44px' }}
      aria-label={`Página ${page.pageNumber}${isSelected ? ' (seleccionada)' : ''}`}
      aria-pressed={isSelected}
    >
      {/* Thumbnail image */}
      <div
        className="w-full bg-base-300 flex items-center justify-center overflow-hidden"
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
                className="w-6 h-6 text-base-content/20 animate-pulse"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
            <span className="text-base-content/30 text-xs">…</span>
          </div>
        )}
      </div>

      {/* Page number label */}
      <div className="w-full py-1 text-center text-xs font-medium text-base-content/70 bg-base-200">
        Pág. {page.pageNumber}
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-sm">
          <svg
            className="w-3 h-3 text-primary-content"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}
