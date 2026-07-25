# v93.0.2 E2E regression repair

This repair is based on the first real desktop/mobile Chromium run of the v93
cumulative release.

## Product defects repaired

- The catalog desktop shell now exposes Search, Calculator, Settings and account
  controls instead of presenting a dead neutral sidebar.
- The question search field now has an explicit accessible name.
- Question-bank requests use a gated development-only preview identity during
  Playwright runs instead of trying to refresh a real Supabase session.
- The local preview API caches securities and foreign-exchange data across
  parallel browser tests.
- The initial HTML shell contains a dark, non-empty status fallback so an
  offline reload never collapses to an empty root.

## Test regressions repaired

- Responsive utility tests open the visible desktop control or mobile menu.
- Hash scrolling accepts the browser's maximum-scroll boundary while still
  requiring focus, feedback and a useful viewport position.
- Securities-home tests use v93 semantic regions instead of removed v86 CSS
  classes.
- Foreign-exchange tests use the current `歷屆試題` and `隨機題數` names.
- Answer-option tests accept the visible full-width Chinese parentheses.
- Search-result tests use the semantic result link rather than an obsolete
  exact accessible-name assumption.

## Validation gate

`npm run test:v93-e2e-regressions` protects these fixes and is part of
`npm run verify`.
