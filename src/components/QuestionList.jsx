import { useState, useRef, useCallback } from 'react';
import { Key, FlaskConical, Swords, Pencil, Check, X } from 'lucide-react';

const TYPES = [
  { key: 'keyword', label: 'Concepto', icon: Key, description: 'Captura términos y definiciones clave del texto' },
  { key: 'methodological', label: 'Metodología', icon: FlaskConical, description: 'Cuestiona la evidencia, los pasos y los procesos' },
  { key: 'combative', label: 'Combate', icon: Swords, description: 'Desafía las ideas del autor, busca objeciones' },
];

/**
 * QuestionList — all questions in one list with type badges and inline editing.
 *
 * @param {object} props
 * @param {Array} props.questions
 * @param {(text: string, type: string) => void} props.onAdd
 * @param {(id: number, text: string) => void} props.onEdit
 * @param {(id: number) => void} props.onDelete
 */
export default function QuestionList({
  questions,
  onAdd,
  onEdit,
  onDelete,
}) {
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef(null);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const trimmed = newText.trim();
      if (!trimmed) return;
      onAdd(trimmed, 'keyword');
      setNewText('');
      inputRef.current?.focus();
    },
    [newText, onAdd],
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

  const startEditing = useCallback((q) => {
    setEditingId(q.id);
    setEditText(q.text);
  }, []);

  const saveEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || editingId === null) return;
    onEdit(editingId, trimmed);
    setEditingId(null);
    setEditText('');
  }, [editText, editingId, onEdit]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);



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
            placeholder="Escribe una pregunta sobre el texto..."
            className="flex-1 px-3 py-2 text-sm border border-base-content/10 rounded-lg bg-base-100 text-base-content focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            aria-label="Nueva pregunta"
            autoFocus
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-content hover:bg-primary-hover disabled:bg-base-200 disabled:text-base-content/40 disabled:cursor-not-allowed transition-colors"
            style={{ minHeight: '44px' }}
          >
            Añadir
          </button>
        </div>

      </form>

      {/* Question list */}
      {questions.length === 0 ? (
        <p className="text-sm text-base-content/40 italic text-center py-4">
          Sin preguntas aún. Escribe una pregunta arriba.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {questions.map((q) => {
            const TypeBadgeIcon = TYPES.find((t) => t.key === q.type)?.icon || Key;
            return (
              <li
                key={q.id || q.text}
                className="flex items-start gap-2 p-3 rounded-lg bg-base-200 border border-base-content/10 group"
              >
                {editingId === q.id ? (
                  /* Inline edit mode */
                  <div className="flex-1 flex flex-col gap-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full p-2 text-sm border border-primary/30 rounded-md focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none bg-base-100 text-base-content"
                      rows={2}
                      style={{ minHeight: '44px' }}
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-base-content/10 text-base-content/70 hover:bg-base-200 transition-colors" style={{ minHeight: '36px' }}>
                        <X size={14} /> Cancelar
                      </button>
                      <button type="button" onClick={saveEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-content hover:bg-primary-hover transition-colors" style={{ minHeight: '36px' }}>
                        <Check size={14} /> Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 flex flex-col gap-1">
                      <span
                        className="text-sm leading-relaxed text-base-content cursor-pointer hover:text-primary"
                        onClick={() => startEditing(q)}
                      >
                        {q.text}
                      </span>
                      {q.type && (
                        <span className="flex items-center gap-1 text-xs text-base-content/50">
                          <TypeBadgeIcon size={10} aria-hidden="true" />
                          {TYPES.find((t) => t.key === q.type)?.label || q.type}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button type="button" onClick={() => startEditing(q)} className="w-6 h-6 flex items-center justify-center rounded text-base-content/30 hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" style={{ minHeight: '24px', minWidth: '24px' }} aria-label="Editar pregunta">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => onDelete(q.id)} className="w-6 h-6 flex items-center justify-center rounded text-base-content/30 hover:text-accent hover:bg-accent/10 opacity-0 group-hover:opacity-100 transition-opacity" style={{ minHeight: '24px', minWidth: '24px' }} aria-label="Eliminar pregunta">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-base-content/40">
        {questions.length} pregunta{questions.length !== 1 ? 's' : ''}
      </p>


    </div>
  );
}
