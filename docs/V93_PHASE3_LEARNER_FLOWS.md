# v93 Phase 3 — learner flows and operation feedback

## Scope

Phase 3 turns the dark visual foundation into consistent, high-feedback learner
workflows. It covers authentication, account sync, activation, search, mock-exam
creation and history deletion, similar-question persistence, leaderboard profile
management, calculator interaction, and settings/data reset.

This phase does not change the question-bank content, answer keys, Supabase
schema, Vercel routing, or deployment configuration.

## Shared interaction primitives

- `V93InlineNotice`: inline success, information, warning, and error state with
  `role=status` / `role=alert` and live announcements.
- `V93PasswordField`: accessible show/hide control, validation hint, disabled
  state, and proper autocomplete attributes.
- `V93ConfirmDialog`: focus-trapped destructive confirmation with Escape,
  backdrop dismissal, busy lock, and focus restoration.
- `GlassButton busy`: visible spinner, disabled semantics, `aria-busy`, and
  consistent pressed feedback.

## Flow changes

### Authentication and password recovery

- Login and registration tabs expose tab semantics.
- Passwords can be shown or hidden without losing field state.
- Submit controls enter a visible busy state immediately.
- Reset redirect timers are cleaned up on unmount.
- Success and error messages are announced globally and remain visible inline.

### Activation and account

- Activation codes are trimmed, normalized, length-limited, and protected from
  duplicate submissions.
- Account sync distinguishes completed and pending-retry outcomes.
- Sync and logout expose busy states and global feedback.
- Entitlement and cloud-sync errors remain visible in context.

### Search

- Search text has a dedicated clear control that restores focus.
- Filters expose pressed state.
- Loading, result count, empty result, no-access, and error-retry states are
  distinct.
- Result links announce the exact exam, chapter/session, and question target.

### Mock exam

- Start errors and empty draw pools no longer fail silently.
- Start buttons expose per-subject busy state.
- Deleting history uses an accessible custom confirmation rather than a native
  browser confirm dialog.
- Partial deletion and retry-required outcomes remain visible.

### Similar questions

- Persistence failures are caught and announced.
- Reveal actions expose busy state and do not unlock explanations before both
  questions are answered.
- Subject filters expose pressed state.
- Reset and navigation clear stale feedback.

### Leaderboard

- Ranking type controls expose tab semantics.
- Refresh, profile save, avatar upload, and removal expose busy/success/error
  feedback.
- Avatar removal uses the shared confirmation dialog.
- Pagination has named controls and a live page position.

### Calculator

- Mobile calculator traps focus; desktop calculator remains a movable tool.
- Results and errors use live regions.
- Every calculator key has an explicit accessible name.
- History has expanded state and disabled clear behavior.
- Calculation, validation, and history actions provide tactile/visual feedback.

### Settings

- Sections expose tab semantics.
- Toggles and study-plan changes announce success.
- Destructive data reset exposes busy state and catches failures.
- Inline messages use the shared dark notice system.

## Regression gates

`npm run test:v93-flows` checks the shared primitives and every Phase 3 flow. It
also rejects blocking `window.alert` / `window.confirm` usage in learner-facing
Phase 3 targets.

`tests/e2e/learner-feedback-v93.spec.ts` covers password visibility, calculator
result announcements, named calculator keys, settings tabs, and destructive
confirmation behavior for desktop/mobile Playwright runs.

## Deferred to Phase 4

- Quiz-engine leave/submit confirmations and answer-save alerts.
- Administration-console destructive actions.
- Full keyboard traversal, axe checks, route-by-route click matrix, and final
  desktop/mobile visual verification.
- Final cumulative installer, restore tool, release notes, and deployment gates.
