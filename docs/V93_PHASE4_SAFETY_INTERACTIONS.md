# v93 Phase 4 — Safety-critical interactions

Phase 4 replaces every blocking browser alert/confirm/prompt remaining in the
application with the shared dark, focus-trapped interaction system.

## Quiz safety

- Answer persistence failures restore the previous answer and expose an inline
  error plus an announced global error.
- Navigation while an answer or submission is still being saved is blocked
  with visible warning feedback instead of a silent no-op or browser alert.
- Leaving an unfinished mock exam opens a focus-trapped confirmation, keeps the
  dialog locked while progress is settled, and restores navigation only after
  the save succeeds.
- Deferred mock submission uses a custom confirmation that reports unanswered
  questions and locks the submit control while grading is in progress.
- The quiz back button now uses the same navigation guard as the application
  shell.

## Administration safety

- Activation-code deletion, administrator disable/delete, entitlement changes,
  password-reset emails, device archival, and leaderboard deletion all use the
  shared confirmation dialog.
- Confirmations expose keyboard focus trapping, Escape/backdrop cancellation,
  busy locking, focus restoration, and announced success/error results.
- Clipboard failures are handled explicitly instead of rejecting silently.
- Existing admin result messages are rendered as semantic status/alert notices.

## Regression gates

`npm run test:v93-safety` scans all TypeScript application source files and
fails if a blocking `window.alert`, `window.confirm`, or `window.prompt` is
reintroduced. It also verifies the quiz, admin, and custom-dialog contracts.

The securities mock-exam E2E now exercises the custom submission dialog rather
than auto-accepting a browser dialog.
