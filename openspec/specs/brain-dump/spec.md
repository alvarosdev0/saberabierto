# brain-dump Specification

## Purpose

After reading a section, the user explains everything they understood in their own words via free-form text with outline markers. Knowledge gaps can be flagged, and notes are saved per section to Dexie.

## Requirements

### Requirement: Free-Form Notes

The system MUST provide a free-form text area where the user writes what they understood after reading a section. Notes auto-save as `status: 'draft'` with a 2-second debounce. An explicit "Guardar" action marks them as `status: 'final'`.

#### Scenario: Write brain dump after reading
- GIVEN the user has just completed reading a section
- WHEN they open the brain dump view and type "El autor argumenta que la memoria se consolida durante el sueño REM..."
- THEN the text is auto-saved as a draft in Dexie with `status: 'draft'` (2-second debounce)
- AND a "Guardar" button marks the note as `status: 'final'`

#### Scenario: Draft survives navigation
- GIVEN the user typed some notes but hasn't tapped "Guardar"
- WHEN the user navigates to another section and returns
- THEN the auto-saved draft text is restored from Dexie

#### Scenario: Empty brain dump not saved
- GIVEN the brain dump text area is empty
- WHEN the user taps "Guardar"
- THEN the system shows: "Escribe algo antes de guardar."
- AND no empty entry is created

### Requirement: Outline Markers

The system SHOULD support hierarchical outline markers (I, II, A, B, 1, 2, etc.) to help users structure their notes.

#### Scenario: Use outline markers
- GIVEN the brain dump text area
- WHEN the user types lines prefixed with "I.", "A.", "1."
- THEN the system preserves these markers as plain text (no auto-formatting required)
- AND line breaks between markers are preserved

### Requirement: Knowledge Gap Flagging

The system MUST allow the user to flag parts of their notes as knowledge gaps — concepts they did not fully understand.

#### Scenario: Flag a gap
- GIVEN the user has written notes
- WHEN they highlight the text "No entiendo bien el mecanismo de la neuroplasticidad" and tap "Marcar como laguna"
- THEN the selected text is tagged as a knowledge gap
- AND flagged gaps appear highlighted in a distinct color

#### Scenario: Review flagged gaps
- GIVEN a brain dump has 3 flagged gaps
- WHEN the user returns to the notes later
- THEN all flagged gaps are still highlighted

### Requirement: Section Navigation

The system MUST provide a `SectionNavigator` component with next/previous buttons and a section progress indicator, allowing the user to move between sections within the same session.

#### Scenario: Navigate between brain dump sections
- GIVEN the user is viewing the brain dump for section 1 of 4
- WHEN the user taps "Siguiente sección"
- THEN the view navigates to `/session/:id/section/2/brain-dump`
- AND any draft notes for section 1 are auto-saved before navigating

### Requirement: Timer

The brain dump view MUST include an optional count-up `Timer` component that tracks elapsed time. When the user completes the section, the elapsed duration is written to `sections.duration`.

#### Scenario: Timer during brain dump
- GIVEN the user opens the brain dump for a section
- WHEN the timer runs for 12 minutes and 30 seconds before the user finishes
- THEN `sections.duration` is updated with 750 seconds
