# SeniorSecurities Optimization Roadmap

更新日期：2026-07-11

## Phase 1 — Reliability stabilization

- [x] Durable FSRS／leaderboard event outbox
- [x] User-scoped local storage and conservative legacy migration
- [x] GitHub Actions full verification
- [ ] Single-source `DailyPlanService` shared by Home and ImageQuiz pages
- [ ] Transaction-safe question release publish／rollback RPC
- [ ] Unified admin authorization and AAL2 enforcement

## Phase 2 — Regression prevention

- [ ] Playwright smoke tests for login, home, bank, chapter, quiz and admin entry
- [ ] Visual regression snapshots for desktop, tablet and mobile
- [ ] Consolidate v67–v70 theme overrides into one design-token layer
- [ ] Add bundle-size budget and post-deploy health check

## Phase 3 — Performance and scale

- [ ] Move FSRS state and attempt history from one large localStorage JSON to IndexedDB
- [ ] Server-side admin pagination and search
- [ ] Versioned PWA asset caches and safe update activation
- [ ] Split large question-bank payloads by subject and chapter
