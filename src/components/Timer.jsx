import { useState, useEffect, useRef } from 'react';

/**
 * Count-up elapsed time tracker.
 *
 * Starts counting on mount. Pauses when the tab loses visibility
 * (e.g. user switches apps). Reports final elapsed seconds via
 * `onElapsed` when the component unmounts (navigation away).
 *
 * @param {object} props
 * @param {(seconds: number) => void} [props.onElapsed] - Called on unmount with total elapsed seconds
 */
export default function Timer({ onElapsed }) {
  const [display, setDisplay] = useState('00:00');
  const startRef = useRef(Date.now());
  const accumulatedRef = useRef(0);
  const intervalRef = useRef(null);

  /** Format seconds as MM:SS or HH:MM:SS. */
  const format = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    startRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const active = Math.floor((Date.now() - startRef.current) / 1000);
      const total = active + accumulatedRef.current;
      setDisplay(format(total));
    }, 1000);

    // Pause on tab hide, resume on tab show
    const handleVisibility = () => {
      if (document.hidden) {
        const active = Math.floor((Date.now() - startRef.current) / 1000);
        accumulatedRef.current += active;
        startRef.current = null;
      } else {
        startRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);

      // Compute final elapsed time
      let finalElapsed = accumulatedRef.current;
      if (startRef.current) {
        finalElapsed += Math.floor((Date.now() - startRef.current) / 1000);
      }

      onElapsed?.(finalElapsed);
    };
    // Intentionally run only on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-muted bg-white/80 dark:bg-surface/80 rounded-full px-3 py-1 shadow-sm border border-gray-100 dark:border-default">
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="font-mono tabular-nums text-gray-700 dark:text-foreground">{display}</span>
    </div>
  );
}
