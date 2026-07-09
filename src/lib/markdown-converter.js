/**
 * Markdown converter — SaberAbierto
 *
 * Converts raw text extracted from PDF to well-formed Markdown.
 * Applies heuristics to detect headings, paragraphs, and lists
 * from the noisy output of PDF text extraction.
 *
 * The conversion is intentionally conservative (prefers false negatives
 * over false positives) because the user gets to review and edit
 * the result before it goes to AI.
 */

/**
 * Convert extracted PDF text to Markdown.
 *
 * Detects and formats:
 *   - Headings: lines that are short, capitalized, or numbered like "1. INTRODUCCIÓN"
 *   - Lists: lines starting with bullets (•, -, *) or numbers
 *   - Paragraphs: blocks separated by double newlines
 *   - PDF artifacts: hyphenated line breaks, extra whitespace
 *
 * @param {string} text - Raw text extracted from PDF
 * @param {object} [options]
 * @param {boolean} [options.preserveLineBreaks=false] - Keep single newlines
 * @returns {string} Markdown-formatted text
 */
export function extractedTextToMarkdown(text, options = {}) {
  if (!text || !text.trim()) return '';

  let cleaned = text;

  // --- Step 1: Clean PDF artifacts ---

  // Remove hyphenated line breaks: "contin-\nues" → "continues"
  cleaned = cleaned.replace(/(\w)-\n(\w)/g, '$1$2');

  // Collapse multiple spaces into one
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  // Remove trailing spaces at end of lines
  cleaned = cleaned.replace(/[ \t]+$/gm, '');

  // Collapse 3+ newlines into exactly 2 (separate paragraphs)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // --- Step 2: Split into blocks ---
  const blocks = cleaned.split(/\n\n+/);
  const markdownBlocks = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');

    // --- Step 3a: Detect headings ---
    // Single short line, all-caps or title-case, possibly numbered
    if (lines.length === 1 && trimmed.length < 120) {
      const headingLevel = guessHeadingLevel(trimmed);
      if (headingLevel) {
        markdownBlocks.push(headingLevel + ' ' + trimmed.replace(/^#+\s*/, ''));
        continue;
      }
    }

    // Multi-line block: check if the first line looks like a heading
    if (lines.length > 1) {
      const firstLine = lines[0].trim();
      if (firstLine.length < 120) {
        const headingLevel = guessHeadingLevel(firstLine);
        if (headingLevel) {
          markdownBlocks.push(headingLevel + ' ' + firstLine.replace(/^#+\s*/, ''));
          // Process remaining lines as a separate block
          const rest = lines.slice(1).join('\n').trim();
          if (rest) {
            markdownBlocks.push(rest);
          }
          continue;
        }
      }
    }

    // --- Step 3b: Detect lists ---
    const isList = lines.every((line) => {
      const t = line.trim();
      return (
        /^[-•*]\s/.test(t) ||
        /^\d+[.)]\s/.test(t) ||
        /^[a-zA-Z][.)]\s/.test(t)
      );
    });

    if (isList && lines.length >= 1) {
      const mdLines = lines.map((line) => {
        const t = line.trim();
        // Convert bullet characters
        if (/^[•]/.test(t)) return '- ' + t.replace(/^[•]\s*/, '');
        if (/^[-*]\s/.test(t)) return '- ' + t.replace(/^[-*]\s*/, '');
        // Numbered: keep as-is but ensure proper format
        if (/^\d+[.)]\s/.test(t)) return t;
        // Lettered
        if (/^[a-zA-Z][.)]\s/.test(t)) return '- ' + t;
        return t;
      });
      markdownBlocks.push(mdLines.join('\n'));
      continue;
    }

    // --- Step 3c: Plain paragraph ---
    // Remove any single newlines within the paragraph
    const paragraph = lines.join(' ').replace(/\s+/g, ' ').trim();
    markdownBlocks.push(paragraph);
  }

  // --- Step 4: Join blocks with double newlines ---
  return markdownBlocks.join('\n\n');
}

/**
 * Guess if a line is a heading and return its Markdown level.
 *
 * Heuristics (in priority order):
 *   1. Already has Markdown heading syntax (# → ###)
 *   2. All-caps short line → ##
 *   3. Starts with a number followed by a dot (e.g., "1. INTRODUCTION") → ##
 *   4. Title case, relatively short → ##
 *   5. No heuristic matches → null (not a heading)
 *
 * @param {string} line
 * @returns {string|null} '#', '##', '###' or null
 */
function guessHeadingLevel(line) {
  const trimmed = line.trim();

  // Already a markdown heading — respect it
  if (/^###\s/.test(trimmed)) return '###';
  if (/^##\s/.test(trimmed)) return '##';
  if (/^#\s/.test(trimmed)) return '#';

  // All-caps heading (short enough to be a title, not a paragraph)
  if (trimmed === trimmed.toUpperCase() && trimmed.length >= 3 && trimmed.length <= 100) {
    return '##';
  }

  // Numbered heading: "1. TÍTULO", "1.1 Subtítulo"
  if (/^\d{1,2}(\.\d)?\s+[A-ZÁÉÍÓÚÑ]/.test(trimmed) && trimmed.length <= 100) {
    return '##';
  }

  // Title case line: starts with capital, contains lowercase, short enough
  if (
    /^[A-ZÁÉÍÓÚÑ]/.test(trimmed) &&
    /[a-záéíóúñ]/.test(trimmed) &&
    trimmed.length <= 80 &&
    !trimmed.endsWith('.') &&
    !trimmed.endsWith(',')
  ) {
    return '###';
  }

  return null;
}
