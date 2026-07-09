# spaced-retrieval Specification

## Purpose

Implements SM-2 spaced repetition for questionnaire questions, provides in-app review reminders (badge counts, dashboard banner, Periodic Background Sync as progressive enhancement), and tracks review history per question in Dexie.

## Requirements

### Requirement: SM-2 Algorithm

The system MUST implement the SM-2 algorithm: first review at 1 day, then double the interval on a correct answer (score ≥ 2), reset to 1 day and repetitions to 0 on forgot (score ≤ 1). Maximum interval is 6 months. The `calculateNextReview` function returns the full computed state: `{ interval, nextReviewDate, repetitions }`, which is persisted in `reviewAttempts.repetitions` for use in the next computation.

#### Scenario: First review — correct answer
- GIVEN a question has never been reviewed (repetitions=0, interval=0)
- WHEN the user scores "correct" (SM-2 score 2)
- THEN the next review is scheduled for 1 day later (interval=1, repetitions=1)

#### Scenario: Consecutive correct — interval doubles
- GIVEN a question with interval=4 days and repetition count=2
- WHEN the user scores "correct" (SM-2 score 2)
- THEN the next interval is 8 days

#### Scenario: Forgot — interval resets
- GIVEN a question with interval=8 days
- WHEN the user scores "forgot" (SM-2 score 0)
- THEN the interval resets to 1 day and the repetition count resets to 0

### Requirement: Review Reminders (In-App Badge)

The system MUST alert the user when reviews are due using an in-app badge/count approach. Push notifications via `setTimeout` are unreliable because the timer is killed when the tab closes, and a backend push server is out of scope for this client-only PWA.

**Approach**:
- On app open, query due reviews and display a badge/count via `navigator.setAppBadge()` where supported.
- Show a "Reviews due" banner on the dashboard.
- **Periodic Background Sync** (`navigator.periodicSync`) as progressive enhancement where the browser supports it (Chrome on Android primarily). It can wake the service worker periodically to check due reviews and update the badge.
- **Known limitation**: Without a backend, reviews cannot notify the user while the app is completely closed on most platforms.

#### Scenario: Notification for due review
- GIVEN a question has a review scheduled for today
- WHEN the user opens the app
- THEN the app badge shows the number of due reviews (via `navigator.setAppBadge()`)
- AND the dashboard shows a "Tienes preguntas pendientes de repaso" banner

#### Scenario: Permission denied / browser unsupported
- GIVEN `navigator.setAppBadge()` is not supported or permission was denied
- WHEN a review is due and the app opens
- THEN the dashboard banner is still shown ("Repaso pendiente") as the primary fallback

### Requirement: Self-Scoring

The system MUST support the SM-2 scoring scale: 0 (complete blackout), 1 (partial recall), 2 (correct with effort), and 3 (perfect recall).

#### Scenario: Score a review
- GIVEN a review question is displayed
- WHEN the user reveals the answer and selects "Correcto con esfuerzo" (score 2)
- THEN the score is recorded in the review history with timestamp
- AND the SM-2 interval is updated accordingly

### Requirement: Three-Month Rule (Stale Subject)

If more than 90 days have elapsed since the last session for a subject (queried via `sessions` compound index `[subject+updatedAt]`), the system SHOULD allow the user to review their brain dump notes before answering spaced-retrieval questions. This is a UX relaxation — it does NOT override the SM-2 algorithm. The SM-2 interval computation is unchanged; the user simply gets a "Repasar notas" option before attempting their review.

#### Scenario: Stale subject — allow note review
- GIVEN the last session for a subject was 95 days ago
- WHEN the user opens a spaced retrieval review for that subject
- THEN a `StaleSubjectBanner` appears with a "Repasar notas" button before the first question
- AND tapping it shows the brain dump notes for the relevant sections

#### Scenario: Recent subject — no note review
- GIVEN the last session was 5 days ago
- WHEN the user opens a spaced retrieval review
- THEN no `StaleSubjectBanner` appears
