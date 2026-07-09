# interrogative-reading Specification

## Purpose

Helps the user formulate pre-reading questions about a text section in three types (keyword, methodological, combative). Questions are saved per section and marked as answered during/after reading.

## Requirements

### Requirement: Question Formulation

The system MUST allow the user to write questions alongside the Markdown text of a given section before reading it. Questions auto-save as drafts with a 2-second debounce, reducing the risk of data loss on accidental navigation or tab close.

#### Scenario: Write keyword questions
- GIVEN a section's Markdown is displayed on the left pane
- WHEN the user types "¿Qué es la potenciación a largo plazo?" under the "Keyword" tab and pauses
- THEN the question is auto-saved as a draft to Dexie linked to this section (2-second debounce)

#### Scenario: Empty question rejected
- GIVEN the question input field is open
- WHEN the user taps "Guardar" with an empty input
- THEN the system shows: "Escribe una pregunta antes de guardar."
- AND nothing is persisted

### Requirement: Three Question Types

The system MUST support three question categories: keyword (key term definitions), methodological (evidence/rationale questions), and combative (critical/challenging questions).

#### Scenario: Write one question of each type
- GIVEN the interrogative reading UI with three tabs: Keyword, Methodological, Combative
- WHEN the user writes one question in each tab and saves
- THEN all three questions are stored with their respective type tags

#### Scenario: User only writes keyword questions
- GIVEN the interrogative reading UI
- WHEN the user writes two keyword questions and leaves the other tabs empty
- THEN only the two keyword questions are saved
- AND no empty placeholders are created for the other types

### Requirement: Markdown Co-display

The section's Markdown text MUST be visible alongside the question form so the user can reference it while writing questions.

#### Scenario: Scroll Markdown independently
- GIVEN a long Markdown text and the question form are side by side
- WHEN the user scrolls the Markdown pane
- THEN the question form stays in place
- AND vice versa (independent scroll)

### Requirement: Answer Marking

The user MUST be able to mark questions as "answered" after finding the answer during reading.

#### Scenario: Mark question as answered
- GIVEN a saved keyword question
- WHEN the user taps the checkbox next to it after finding the answer
- THEN the question is marked as "answered" with a timestamp

### Requirement: Section Navigation

The system MUST provide a `SectionNavigator` component with next/previous buttons and a section progress indicator, allowing the user to move between sections within the same session without returning to the home dashboard.

#### Scenario: Navigate to next section
- GIVEN the user is viewing section 1 of 3
- WHEN the user taps "Siguiente sección"
- THEN the view navigates to `/session/:id/section/2/read`
- AND the progress indicator updates to "2/3"

#### Scenario: Previous section preserves state
- GIVEN the user wrote 2 questions in section 1 then moved to section 2
- WHEN the user taps "Sección anterior"
- THEN section 1's questions are still present (persisted in Dexie)

### Requirement: Section Timer
The system SHOULD display a count-up timer during interrogative reading.

#### Scenario: Timer tracks reading duration
- GIVEN the user is on the interrogative reading page for a section
- WHEN the page loads
- THEN a count-up timer starts
- AND when the user navigates away, the elapsed duration is saved to sections.duration

#### Scenario: Timer pauses on navigation
- GIVEN the timer is running
- WHEN the user navigates to another section
- THEN the timer pauses
- AND resumes when the user returns to the section
