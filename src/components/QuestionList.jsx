import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * QuestionList — displays and manages study questions for a section.
 *
 * Each question has:
 *   - text: The question content
 *   - type: 'keyword' | 'methodological' | 'combative'
 *   - answered: boolean
 *   - answeredAt: timestamp (set when answered is toggled on)
 *
 * @param {object} props
 * @param {Array<{id?: number, text: string, type: string, answered: boolean, answeredAt?: Date}>} props.questions
 * @param {string} props.activeType - Currently selected question type filter
 * @param {(text: string, type: string) => void} props.onAdd - Called to add a new question
 * @param {(id: number) => void} props.onToggleAnswered - Called when checkbox is toggled
 * @param {(id: number) => void} props.onDelete - Called to delete a question
 */
export default function QuestionList({
  questions,
  activeType,
  onAdd,
  onToggleAnswered,
  onDelete,
}) {
  const [newText, setNewText] = useState('');
  const inputRef = useRef(null);

  const filtered = questions.filter((q) => q.type === activeType);

  // Focus the input when tab changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeType]);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const trimmed = newText.trim();
      if (!trimmed) return;
      onAdd(trimmed, activeType);
      setNewText('');
    },
    [newText, activeType, onAdd],
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Add question form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder(activeType)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-default rounded-lg bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none"
            style={{ minHeight: 'var(--touch-target-min)' }}
            aria-label="Nueva pregunta"
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            style={{ minHeight: 'var(--touch-target-min)', minWidth: 'var(--touch-target-min)' }}
          >
            Añadir
          </button>
        </div>
      </form>

      {/* Question list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 italic text-center py-4">
          Sin preguntas aún. Escribe una pregunta arriba.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((q) => (
            <li
              key={q.id || q.text}
              className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-muted border border-gray-100 dark:border-default group"
            >
              {/* Answer checkbox */}
              <button
                type="button"
                onClick={() => onToggleAnswered(q.id)}
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  q.answered
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-gray-300 hover:border-emerald-400'
                }`}
                style={{ minHeight: '20px', minWidth: '20px' }}
                aria-label={q.answered ? 'Marcar como no respondida' : 'Marcar como respondida'}
              >
                {q.answered && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>

              {/* Question text */}
              <span
                className={`flex-1 text-sm leading-relaxed ${
                  q.answered ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-foreground'
                }`}
              >
                {q.text}
              </span>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => onDelete(q.id)}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                style={{ minHeight: '24px', minWidth: '24px' }}
                aria-label="Eliminar pregunta"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Question count */}
      <p className="text-xs text-gray-400">
        {filtered.length} pregunta{filtered.length !== 1 ? 's' : ''} ·{' '}
        {filtered.filter((q) => q.answered).length} respondida{filtered.filter((q) => q.answered).length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

/** Get placeholder text for each question type. */
function getPlaceholder(type) {
  switch (type) {
    case 'keyword':
      return 'Ej: ¿Qué significa "plasticidad neuronal"?';
    case 'methodological':
      return 'Ej: ¿Qué evidencia apoya esta afirmación?';
    case 'combative':
      return 'Ej: ¿Tienen razón en este argumento?';
    default:
      return 'Escribe tu pregunta...';
  }
}
