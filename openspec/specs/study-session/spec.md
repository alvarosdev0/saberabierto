# study-session Specification

## Purpose

Manages the lifecycle of a study session: creation, tracking, sections, timer, and sequential focus (one active subject/book at a time). Session data persists in Dexie for continuation across app restarts.

## Requirements

### Requirement: Session Creation

The system MUST allow the user to create a new study session associated with one subject/book name. Only one session may be active at a time. Session lifecycle: `'active'` (default on creation) → `'completed'` (questionnaire builder marks it done) → or `'abandoned'` (user closes without completing; resumable).

The sessions table tracks both `createdAt` and `updatedAt` timestamps. A compound index `[subject+updatedAt]` enables efficient stale-subject queries for the 3-month rule.

#### Scenario: Create first session
- GIVEN no active session exists
- WHEN the user taps "Nueva sesión", enters "Neurociencia del aprendizaje", and confirms
- THEN a session is created with status "active", subject "Neurociencia del aprendizaje", and today's date
- AND the session appears on the home dashboard

#### Scenario: Attempt second active session
- GIVEN an active session exists for "Neurociencia del aprendizaje"
- WHEN the user taps "Nueva sesión" and enters "Filosofía de la mente"
- THEN the system warns: "Ya tienes una sesión activa. Ciérrala antes de empezar otra."
- AND the existing session remains active

### Requirement: Section Management

Each session MAY contain multiple sections (~20 min reading blocks). The system MUST track section completion status and duration.

#### Scenario: Add sections to a session
- GIVEN an active session exists
- WHEN the user adds sections: "Capítulo 1: Introducción", "Capítulo 1: Métodos"
- THEN both sections are listed under the session
- AND each starts with status "pending" and a timer option

#### Scenario: Complete a section
- GIVEN a section with timer running
- WHEN the user marks the section as complete
- THEN the section status changes to "completed"
- AND the elapsed duration is recorded

### Requirement: Session Persistence

The system MUST persist session data to Dexie so the user can close and reopen the app without losing progress.

#### Scenario: Resume session after app restart
- GIVEN a session with 2 completed and 1 pending section was active
- WHEN the user closes and reopens the app
- THEN the home dashboard shows the active session with a "Continuar" button
- AND all section states are preserved

### Requirement: Section Ordering
The system MUST assign each section a sequential order on creation.

#### Scenario: Sections ordered by creation
- GIVEN a session with no sections
- WHEN the user creates two sections
- THEN the first section has order=0
- AND the second section has order=1

(Reordering is deferred to a future enhancement.)
