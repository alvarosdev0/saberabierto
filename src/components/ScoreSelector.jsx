import { useCallback } from 'react';

/**
 * ScoreSelector — 4-button SM-2 recall quality selector.
 *
 * Per design §Component Tree (SpacedRetrieval → ScoreSelector):
 *   0 — "Olvidé"
 *   1 — "Parcial"
 *   2 — "Correcto con esfuerzo"
 *   3 — "Perfecto"
 *
 * Touch targets ≥44 px in at least one dimension (WCAG 2.5.5).
 *
 * @param {object} props
 * @param {(score: 0|1|2|3) => void} props.onSelect — Called with the chosen score
 * @param {boolean} [props.disabled]                — Disable all buttons
 */
export default function ScoreSelector({ onSelect, disabled = false }) {
  const handleSelect = useCallback(
    (score) => {
      if (!disabled) onSelect(score);
    },
    [onSelect, disabled],
  );

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Calidad de recuerdo">
      <p className="text-xs font-medium text-gray-500 text-center mb-1">
        ¿Qué tan bien recordaste?
      </p>
      <div className="grid grid-cols-2 gap-2">
        {/* Score 0 — Olvidé */}
        <button
          type="button"
          role="radio"
          aria-checked={false}
          disabled={disabled}
          onClick={() => handleSelect(0)}
          className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition-[border-color,background-color,box-shadow] duration-150"
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <span className="text-lg">😕</span>
          <span className="text-xs font-semibold">Olvidé</span>
          <span className="text-[10px] opacity-60">0</span>
        </button>

        {/* Score 1 — Parcial */}
        <button
          type="button"
          role="radio"
          aria-checked={false}
          disabled={disabled}
          onClick={() => handleSelect(1)}
          className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 active:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed transition-[border-color,background-color,box-shadow] duration-150"
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <span className="text-lg">🤔</span>
          <span className="text-xs font-semibold">Parcial</span>
          <span className="text-[10px] opacity-60">1</span>
        </button>

        {/* Score 2 — Correcto con esfuerzo */}
        <button
          type="button"
          role="radio"
          aria-checked={false}
          disabled={disabled}
          onClick={() => handleSelect(2)}
          className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border-2 border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 active:bg-purple-200 disabled:opacity-40 disabled:cursor-not-allowed transition-[border-color,background-color,box-shadow] duration-150"
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <span className="text-lg">💪</span>
          <span className="text-xs font-semibold">Correcto con esfuerzo</span>
          <span className="text-[10px] opacity-60">2</span>
        </button>

        {/* Score 3 — Perfecto */}
        <button
          type="button"
          role="radio"
          aria-checked={false}
          disabled={disabled}
          onClick={() => handleSelect(3)}
          className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition-[border-color,background-color,box-shadow] duration-150"
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <span className="text-lg">✨</span>
          <span className="text-xs font-semibold">Perfecto</span>
          <span className="text-[10px] opacity-60">3</span>
        </button>
      </div>
    </div>
  );
}
