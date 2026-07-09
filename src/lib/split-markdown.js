/**
 * Split a markdown string into sections by headings.
 *
 * Each `## Heading` (H2) starts a new section. H1 headings are treated as
 * the first section's title. If no headings are found, the entire content
 * becomes a single section titled "Contenido".
 *
 * @param {string} markdown - Raw markdown content
 * @returns {{ title: string, content: string }[]} Array of sections
 */
export function splitMarkdownIntoSections(markdown) {
  if (!markdown || !markdown.trim()) {
    return [{ title: 'Contenido', content: '' }];
  }

  const lines = markdown.split('\n');
  const sections = [];
  let currentTitle = 'Introducción';
  let currentContent = [];
  let foundHeading = false;

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)/);
    const h1Match = !foundHeading ? line.match(/^# (.+)/) : null;

    if (h2Match || h1Match) {
      // Save previous section if it has content
      if (currentContent.length > 0 || foundHeading) {
        sections.push({
          title: currentTitle,
          content: currentContent.join('\n').trim(),
        });
      }
      currentTitle = (h2Match || h1Match)[1].trim();
      currentContent = [];
      foundHeading = true;
    } else {
      currentContent.push(line);
    }
  }

  // Push final section
  sections.push({
    title: currentTitle,
    content: currentContent.join('\n').trim(),
  });

  // Fallback: no headings found — single section
  if (sections.length === 1 && !foundHeading) {
    return [{ title: 'Contenido', content: markdown.trim() }];
  }

  return sections;
}

/**
 * Extract the first H1 heading from markdown to use as a session subject.
 *
 * @param {string} markdown
 * @returns {string|null}
 */
export function extractSubjectFromMarkdown(markdown) {
  if (!markdown) return null;
  const match = markdown.match(/^# (.+)$/m);
  return match ? match[1].trim() : null;
}
