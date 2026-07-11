# SeniorSecurities Optimization Roadmap

更新日期：2026-07-12  
狀態：**v79 高優先級資料完整性、安全、PWA、題庫品質與部署計畫完成。**

## Completed — Data Integrity

- [x] Server-authored `sync_version` cursor
- [x] Keyset pagination，移除 mutable offset 與 client wall-clock checkpoint
- [x] Download-first bootstrap 與 explicit tombstone reconciliation
- [x] Per-user IndexedDB transactional outbox
- [x] FSRS state／attempt／outbox atomic transaction
- [x] Image quiz session cloud sync
- [x] Batch RPC、event-id、coalescing、backoff、jitter、dead-letter
- [x] Dead-letter retry／discard UI
- [x] 3,500-row、1,200-attempt、多帳號與 atomic outbox tests

## Completed — Security and Release Integrity

- [x] Central Admin authorization
- [x] Hard-coded Admin Email removed
- [x] Inactive assignment fail closed
- [x] Primary admin／AAL2 for sensitive actions
- [x] Admin／activation mutation + audit transaction RPC
- [x] Published-only question override API
- [x] ETag、CDN cache、release-item pagination
- [x] Activation plaintext not stored
- [x] Privacy-safe telemetry limits and redaction
- [x] CSP／HSTS／nosniff／frame／referrer／permissions headers

## Completed — Question Data and Performance

- [x] 3,526-question semantic crop validator
- [x] 6 missing crop records corrected
- [x] 40 content-hashed chapter shards
- [x] `questionId -> shard` manifest index
- [x] Chapter／Daily Plan／wrong／favorite／similar／session selective materialization
- [x] Raw editor source and backups excluded from production output
- [x] Compact planning index and bundle budgets
- [x] Offline package cache verification

## Completed — CI and Maintainability

- [x] Chromium + WebKit browser installation in CI
- [x] Desktop／mobile／iPad Chromium／iPad WebKit projects
- [x] Polling production health check with security and cache header validation
- [x] CSS historical artifact cleanup
- [x] CSS file／line／`!important` maintenance budgets
- [x] Full TypeScript／API／lint／unit／integrity／build／PWA verification

## Optional Future Work — Measurement Driven

These are not correctness blockers and should only be started when production measurements justify them:

- [ ] Generate responsive pre-cropped WebP/AVIF only if real-device image decode or transfer metrics show a bottleneck. The current 818 full-page assets are shared by 3,526 questions and benefit from page-level cache reuse.
- [ ] Replace screenshot artifacts with pixel baselines after approving stable screenshots on GitHub Actions environments.
- [ ] Further split `glass.css` into component modules while keeping CSS budget and browser screenshot protection green.
- [ ] Add a disposable Supabase CI environment when a complete migration-only baseline and CI project credentials are available.
- [ ] Move question images to object storage/CDN if repository or deployment limits become material.
