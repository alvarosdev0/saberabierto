import { useState, useCallback } from 'react';
import { Button, Text } from '@ninna-ui/primitives';

/**
 * Editable Markdown editor with live preview toggle.
 *
 * Used after PDF text extraction to let the user review and edit
 * the auto-converted Markdown before proceeding to AI generation.
 *
 * @param {object} props
 * @param {string} props.markdown - Initial Markdown content
 * @param {(md: string) => void} props.onChange - Called on every keystroke
 * @param {(md: string) => void} props.onAccept - Called when user confirms
 * @param {() => void} props.onRegenerate - Called to re-extract from PDF
 */
export default function MarkdownEditor({
  markdown,
  onChange,
  onAccept,
  onRegenerate,
}) {
  const [previewMode, setPreviewMode] = useState(false);

  const handleChange = useCallback(
    (e) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  /**
   * Simple Markdown-to-HTML renderer for preview.
   * Handles: headings (#), lists (- or * or 1.), paragraphs, bold (**), italic (*)
   */
  const renderPreview = (md) => {
    if (!md) return '<p class="text-base-content/40 italic">Sin contenido</p>';

    let html = md
      // Escape HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Headings (must be at start of line)
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-primary mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-primary mt-5 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-primary mt-6 mb-3">$1</h1>')
      // Unordered lists
      .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
      // Ordered lists
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
      // Paragraphs (double newlines)
      .replace(/\n\n/g, '</p><p class="mb-2">')
      // Single newlines → <br>
      .replace(/\n/g, '<br>');

    // Wrap in paragraph if not already
    if (!html.startsWith('<h') && !html.startsWith('<li')) {
      html = '<p class="mb-2">' + html + '</p>';
    }

    // Wrap consecutive <li> in <ul>
    html = html.replace(
      /((?:<li class="ml-4 list-disc">.*?<\/li>\s*)+)/g,
      '<ul class="mb-3">$1</ul>',
    );
    html = html.replace(
      /((?:<li class="ml-4 list-decimal">.*?<\/li>\s*)+)/g,
      '<ol class="mb-3">$1</ol>',
    );

    return html;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-base-200 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setPreviewMode(false)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              !previewMode
                ? 'bg-base-100 text-primary shadow-sm'
                : 'text-base-content/70 hover:text-base-content'
            }`}
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode(true)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              previewMode
                ? 'bg-base-100 text-primary shadow-sm'
                : 'text-base-content/70 hover:text-base-content'
            }`}
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            Vista previa
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
          >
            Regenerar desde PDF
          </Button>
          <Button
            color="primary"
            size="sm"
            onClick={() => onAccept(markdown)}
          >
            Aceptar
          </Button>
        </div>
      </div>

      {/* Editor / Preview */}
      {previewMode ? (
        <div
          className="w-full min-h-[300px] p-4 rounded-lg border border-base-content/10 bg-base-100 overflow-auto font-sans text-base-content leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderPreview(markdown) }}
        />
      ) : (
        <textarea
          value={markdown}
          onChange={handleChange}
          className="w-full min-h-[300px] p-4 rounded-lg border border-base-content/10 bg-base-100 font-mono text-sm text-base-content resize-y focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
          placeholder="El texto extraído aparecerá aquí..."
          aria-label="Editor de Markdown"
        />
      )}

      {/* Word/char count */}
      <Text size="xs" className="text-base-content/40 text-right">
        {markdown.length.toLocaleString()} caracteres ·{' '}
        {markdown ? markdown.trim().split(/\s+/).length : 0} palabras
      </Text>
    </div>
  );
}
