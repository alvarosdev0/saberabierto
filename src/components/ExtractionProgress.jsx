/**
 * Extraction progress bar with stage labels.
 *
 * Displays current progress during PDF text extraction.
 * Shows a checkmark on completion.
 *
 * @param {object} props
 * @param {{ current: number, total: number, stage: string }} props.progress
 *   current — current page being processed
 *   total   — total pages selected
 *   stage   — one of: 'loading' | 'thumbnails' | 'extracting' | 'done'
 * @param {number} [props.wordCount] - Extracted word count (shown on completion)
 */
export default function ExtractionProgress({ progress, wordCount }) {
  const { current, total, stage } = progress;

  const stageLabels = {
    loading: 'Cargando PDF...',
    thumbnails: 'Generando miniaturas...',
    extracting: 'Extrayendo texto...',
    done: '¡Listo!',
  };

  const isDone = stage === 'done';
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 p-4 bg-base-100 rounded-lg border border-base-content/10">
      {/* Stage label + percentage */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isDone ? (
            <svg
              className="w-5 h-5 text-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 text-primary animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          )}
          <span className="font-medium text-base-content">
            {stageLabels[stage] || stage}
          </span>
        </div>

        {!isDone && (
          <span className="text-sm text-base-content/50">
            {current} / {total}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-base-300 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${
            isDone ? 'bg-success' : 'bg-primary'
          }`}
          style={{ width: `${isDone ? 100 : percent}%` }}
          role="progressbar"
          aria-valuenow={isDone ? 100 : percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progreso: ${percent}%`}
        />
      </div>

      {/* Word count on completion */}
      {isDone && wordCount != null && (
        <p className="text-sm text-base-content/70">
          {wordCount.toLocaleString()} palabras extraídas
        </p>
      )}
    </div>
  );
}
