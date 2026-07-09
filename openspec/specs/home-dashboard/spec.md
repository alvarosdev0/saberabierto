# home-dashboard Specification

## Purpose

Provides an overview of the user's study activity: current subject, next review due, session continuation, and quick stats like streak, total questions answered, and reviews completed.

## Requirements

### Requirement: Current Subject Display

The system MUST show the currently active subject/book and a "Continuar sesión" button if an active session exists.

#### Scenario: Active session shown on dashboard
- GIVEN an active session "Neurociencia del aprendizaje" with 2 of 5 sections completed
- WHEN the user opens the app
- THEN the dashboard shows "Neurociencia del aprendizaje" as the current subject
- AND a "Continuar sesión" button is present with section progress (2/5)

#### Scenario: No active session
- GIVEN no active session exists
- WHEN the user opens the app
- THEN the dashboard shows "Ningún libro activo" and a "Nueva sesión de estudio" button is prominent

### Requirement: Quick Stats

The system MUST display cumulative stats: total questions answered, reviews completed, current streak of consecutive study days, and a due-reviews badge count.

#### Scenario: Stats update after session
- GIVEN the user completes a session answering 10 questions and doing 15 reviews
- WHEN the session ends
- THEN the dashboard stats increment accordingly
- AND the streak updates if today is a new study day
- AND `navigator.setAppBadge()` is called with the number of due reviews (where supported)

#### Scenario: Streak broken
- GIVEN the user's last study day was 2 days ago (yesterday was missed)
- WHEN the user opens the app today and starts a new session
- THEN the streak resets to 1

### Requirement: Review Countdown

The system MUST display the next spaced retrieval due with a countdown or relative time ("en 2 días", "hoy").

#### Scenario: Review due today
- GIVEN the next review is scheduled for today
- WHEN the user opens the dashboard
- THEN a "Repaso pendiente" badge is shown with "Hoy"

#### Scenario: No reviews due
- GIVEN no reviews are scheduled in the next 7 days
- WHEN the user opens the dashboard
- THEN "Sin repasos próximos" is shown

### Requirement: Knowledge Gaps to Revisit

The system MUST display a list of flagged knowledge gaps from brain dumps on the home dashboard so gaps are not forgotten.

#### Scenario: Gaps shown on dashboard
- GIVEN the user flagged 3 gaps during brain dumps across various sessions
- WHEN the user opens the home dashboard
- THEN a "Lagunas por repasar" section lists the 3 gaps with their source section names
- AND tapping a gap navigates to its brain dump notes

#### Scenario: No gaps flagged
- GIVEN no knowledge gaps have been flagged
- WHEN the user opens the home dashboard
- THEN no "Lagunas por repasar" section is displayed
