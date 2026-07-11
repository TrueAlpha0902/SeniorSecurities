# SeniorSecurities Current State

更新日期：2026-07-11  
目前版本：**Stabilization Final（v78）— 資料完整性、安全治理、PWA 穩定、題庫分片與回歸防護**

## 已完成的系統級優化

### 資料完整性與跨裝置同步

- 雲端紀錄改為明確 500 筆分頁、穩定次排序與增量 checkpoint，不再把「本次查詢未回傳」誤判為刪除。
- Checkpoint 只在完整合併成功後前進；同步途中若產生待送事件會中止且保留原 checkpoint。
- 增量 overlap 同時出現舊 tombstone 與較新重建資料時，以較新 live row 為準，避免誤刪重建紀錄。
- 新增 `user_record_tombstones`，答案、錯題、收藏、進度及 session 的刪除透過明確 tombstone 同步。
- 初次上傳採 250 筆批次，離線 cloud mutation queue 採 50 筆同步批次。
- FSRS learning states、attempt history、cloud mutation queue、dead-letter queue 與 sync metadata 搬到 IndexedDB。
- Queue 支援 event-id 冪等、coalescing、指數退避、jitter、最多 8 次重試及 dead-letter。
- 3,500 筆學習狀態、1,200 筆 attempt 上限、多帳號隔離及 dead-letter 已有自動測試。
- 帳號頁顯示等待同步與 dead-letter 數量。

### Daily Plan

- 首頁與每日練習共用單一 `DailyPlanService`。
- 今日已完成題目在候選池建立前排除，不再占用新題名額。
- 將「全題庫覆蓋所需速度」與「依每日讀書時間可執行題數」分開；首頁操作題數使用可執行值。
- reserve days 依穩定／標準／衝刺強度實際生效。
- 首頁仍只載入約 268 KB compact index，不重新載入完整 crop payload。

### 題庫與離線效能

- 完整題庫拆成 release manifest 與 40 個科目／章節 shard，共 3,526 題。
- Bank／chapter route 只載入需要的 shard；跨題庫模式才載入全部相關 shard。
- Manifest 與 shard 以內容 hash 版本化，不再依賴人工 cache 常數。
- 設定頁加入「離線題庫」，可按科目下載或清除題目資料與 PDF 圖片。
- 題庫 shard 不進 precache，透過 runtime cache 與使用者選擇的離線科目包管理。

### 管理權限與發布治理

- `/api/admin/*` 統一使用 `_adminClient.requireAdminUser()`。
- 發布、回滾及高風險管理操作要求 primary admin／AAL2。
- 題庫 publish／rollback 改為 PostgreSQL transaction RPC，release pointer、狀態與 audit event 原子更新。
- 正式題庫 API 沒有 active release 時只使用 bundled stable data，絕不 fallback 到 draft。
- Activation code 只保存 hash 與 preview；明文僅建立當下回傳一次，migration 會清空舊 `code_plain`。
- 管理工具新增「系統狀態」，檢查 release、環境、預期 migration、MFA 與核心資料表。
- 使用者及排行榜 API 使用 server-side pagination。

### PWA、空白頁復原與觀測

- Route、計算機、設定與 Analytics 的 lazy chunks 全部使用 `lazyWithRetry()`。
- Analytics 有獨立 Error Boundary，不會拖垮主 App。
- Service Worker 更新狀態保存於 module-level store；新版不在操作途中強制接管舊分頁。
- 清除舊快取只處理本 App scope、`question-bank-*` 與 Workbox precache，不清除 IndexedDB／localStorage。
- 新增隱私安全 client telemetry：只記錄 release、route、錯誤 fingerprint、PWA/SW 狀態；不記錄 Email、token、題目或答案。
- 新增 production health check：HTML、manifest、SW、release manifest、plan index、trial、built assets 與第一個 shard。

### 安全標頭與 CI

- Vercel 加入 CSP、HSTS、nosniff、DENY、Referrer-Policy、Permissions-Policy 與 COOP。
- GitHub Actions 執行完整 `npm run verify`、Chromium browser smoke、offline、accessibility 及多 viewport 測試。
- main push 可在設定 `POST_DEPLOY_BASE_URL` 後執行 production health check。
- 新增 `.gitattributes` 固定程式碼 LF，避免 Windows Git 的 CRLF 警告與不必要 diff。

### UI 回歸防護

- v67–v70 歷史主題載入已合併為單一 `theme-current.css`，不再同時 import 多個歷史版本檔。
- Integrity contract 會檢查進度條、錯誤次數紅色、正解綠色、答錯紅色等關鍵 selector。
- Playwright 覆蓋 App 啟動、計算機、設定、trial 正誤色彩、離線 reload 及 axe serious/critical accessibility。
- 初始資源 gzip、最大 JS 與 CSS 仍由 bundle budget 保護。

## 驗證

執行：

```bash
npm run verify
```

已通過：

- 題庫 shard／manifest freshness：3,526 題、40 shards
- compact plan index freshness：3,526 題、268,395 bytes
- Frontend TypeScript
- API TypeScript
- ESLint
- Calculator core／advanced modes
- FSRS／deadline-aware Daily Plan
- User-scoped storage
- Reliability store 3,500-row capacity／queue／dead-letter
- Security and data-integrity contracts
- DailyPlanService consistency
- App recovery detection
- Question data validation
- Production build／PWA generation
- Bundle-size budget：初始資源約 164.7 KiB gzip
- Desktop Chromium browser smoke／trial colors／offline reload（本地）

GitHub Actions 另執行 desktop、iPad、mobile Chromium projects。完整 Playwright browser 在 CI 使用官方安裝版本。

## 資料庫

部署前必須套用：

```text
supabase/migrations/20260712090000_stabilization_final.sql
```

Migration 新增 tombstones、batched RPC、transactional release RPC、client-error telemetry，並清空舊 activation-code plaintext。

## Codex／AI 下次開始方式

1. 執行 `git status --short` 與 `git log -1 --oneline`。
2. 閱讀本文件。
3. 只讀取 `docs/AI_CHANGELOG.md` 最後一筆。
4. 架構任務再讀 `docs/OPTIMIZATION_ROADMAP.md` 與 `docs/STABILIZATION_FINAL_REPORT.md`。
5. 修改後必須執行 `npm run verify`；UI/PWA 修改另執行 `npm run test:e2e`。
