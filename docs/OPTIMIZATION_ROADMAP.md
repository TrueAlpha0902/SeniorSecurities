# SeniorSecurities Optimization Roadmap

更新日期：2026-07-11

目前進度：v74 已完成前端關鍵路徑與 bundle 最終效能階段；後續工作以安全、管理端規模與自動化測試為主。

## Reliability stabilization

- [x] Durable FSRS／leaderboard event outbox
- [x] User-scoped local storage and conservative legacy migration
- [x] GitHub Actions full verification
- [x] Single-source `DailyPlanService`
- [ ] Transaction-safe question release publish／rollback RPC
- [ ] Unified admin authorization and AAL2 enforcement

## Performance and regression prevention

- [x] Compact daily-plan question index; homepage avoids full crop payload
- [x] Lazy calculator, settings, analytics and FSRS scheduler chunks
- [x] Homepage WebP asset and stable image dimensions
- [x] Deferred service-worker registration and exact next-question prefetch URL
- [x] Progressive long-list rendering and `content-visibility`
- [x] ES2022 build target and bundle-size budgets in `npm run verify`
- [x] In-memory learning-state read cache
- [ ] Playwright smoke tests for login, home, bank, chapter, quiz and admin entry
- [ ] Visual regression snapshots for desktop, tablet and mobile
- [ ] Consolidate v67–v70 theme overrides into one design-token layer
- [ ] Post-deploy health check

## Scale and maintainability

- [ ] Move FSRS state and attempt history from one large localStorage snapshot to IndexedDB
- [ ] Server-side admin pagination and search
- [ ] Split full crop payload by subject/chapter for non-daily quiz routes
- [ ] Transactional release publication and immutable release manifest
