# markdown-converter Specification

## Purpose

Converts extracted PDF text to editable Markdown with basic formatting preserved (headings, paragraphs, lists). Users may edit the Markdown before sending it to AI, or send directly.

## Requirements

### Requirement: Auto-Conversion to Markdown

The system MUST auto-convert extracted text to Markdown format, preserving detected headings, paragraph breaks, and list structures.

#### Scenario: Text with headings and paragraphs
- GIVEN extracted text contains "Chapter 1\n\nThe quick brown fox...\n\n## Section A\n\nList:\n- item 1\n- item 2"
- WHEN auto-conversion runs
- THEN the output Markdown includes `# Chapter 1`, paragraph breaks, `## Section A`, and a markdown list

#### Scenario: Plain text with no structure
- GIVEN extracted text is a single continuous block with no identifiable structure
- WHEN auto-conversion runs
- THEN the output is the same text wrapped in paragraph tags (pure text MD)
- AND no errors are shown

### Requirement: Editable Preview

The system MUST present the generated Markdown in an editable preview where the user can modify content before proceeding.

#### Scenario: User edits Markdown before sending
- GIVEN the Markdown preview is displayed
- WHEN the user adds a new heading "## My Notes" and types additional content
- THEN the edited Markdown is what gets sent to AI or saved
- AND the original auto-converted version is NOT preserved (edit is destructive)

#### Scenario: User sends directly without editing
- GIVEN the Markdown preview is displayed
- WHEN the user taps "Send" without making any edits
- THEN the auto-converted Markdown is sent as-is
