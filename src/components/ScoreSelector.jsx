import { useCallback } from 'react';
import { Frown, Meh, ThumbsUp, Sparkles } from 'lucide-react';
import { Text } from '@ninna-ui/primitives';

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
      <Text size="xs" className="text-base-content/50 text-center mb-1">
        ¿Qué tan bien recordaste?
      </Text>
      <div className="grid grid-cols-2 gap-2">
        {/* Score 0 — Olvidé */}
        <button
          type="button"
          role="radio"
          aria-checked={false}
          disabled={disabled}
          onClick={() => handleSelect(0)}
          className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border-2 border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 active:bg-danger/30 disabled:opacity-40 disabled:cursor-not-allowed transition-[border-color,background-color,box-shadow] duration-150"
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <Frown size={22} aria-hidden="true" />
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
          className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border-2 border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 active:bg-warning/30 disabled:opacity-40 disabled:cursor-not-allowed transition-[border-color,background-color,box-shadow] duration-150"
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <Meh size={22} aria-hidden="true" />
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
          className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border-2 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-[border-color,background-color,box-shadow] duration-150"
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <ThumbsUp size={22} aria-hidden="true" />
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
          className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border-2 border-success/30 bg-success/10 text-success hover:bg-success/20 active:bg-success/30 disabled:opacity-40 disabled:cursor-not-allowed transition-[border-color,background-color,box-shadow] duration-150"
          style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
        >
          <Sparkles size={22} aria-hidden="true" />
          <span className="text-xs font-semibold">Perfecto</span>
          <span className="text-[10px] opacity-60">3</span>
        </button>
      </div>
    </div>
  );
}
