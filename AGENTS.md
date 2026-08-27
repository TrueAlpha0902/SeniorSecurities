# SeniorSecurities AI 工作規則

## 最低讀取範圍

1. 先執行 `git status --short` 與 `git log -1 --oneline`。
2. 讀取 `docs/CURRENT_STATE.md`。
3. 只讀取 `docs/AI_CHANGELOG.md` 最後一筆。
4. 架構、同步、效能或安全任務再讀取 `docs/OPTIMIZATION_ROADMAP.md` 與 `docs/STABILIZATION_FINAL_REPORT.md`。
5. 除非任務需要，不要預先掃描舊版 README、備份 JSON、桌面 EXE、`dist`、`dev-dist` 或建置產物。

## 修改後必做

- 執行 `npm run verify`。
- UI、PWA、routing、modal、答案狀態或 CSS 變更另執行 `npm run test:e2e`。
- 更新 `docs/CURRENT_STATE.md` 與 `docs/AI_CHANGELOG.md`。
- PR 與 main push 必須通過 GitHub Actions Verify／browser-smoke。
- 涉及資料庫時只能新增 migration，不得修改已在 production 套用的 migration。

## 資料與安全

- 不得提交 `.env`、私鑰、service-role key、Vercel token、`.vercel`、`supabase/.temp`、`node_modules`、`dist`、log 或 Playwright artifacts。
- 題庫說明必須保留完整原文；OCR 內容只能標示為未校對、已逐字校對或需複查。
- 管理權限只能透過 `api/_adminClient.ts` 的 `requireAdminUser()`；不得在個別 API 自建驗證。
- 高風險操作原則上要求 primary admin 與 AAL2；題庫正式發布由 primary admin 直接執行，可在 AAL1 發布目前已儲存的修改。會員永久刪除依產品決策改採 primary admin 目前密碼重新驗證，必須由獨立、不持久化的 Auth client 取得新 access token，伺服器再核對同一管理員、同一 session 與 10 分鐘內的 password AMR；密碼不得傳入應用程式 API。回滾與其餘管理員破壞性異動仍必須 AAL2。
- 已使用的啟用碼只能封存，不得刪除兌換 ledger、扣回使用次數或撤銷既有會員權限；未使用且無歷史的啟用碼才可實體刪除。啟用碼分類必須保留不可逆的來源追溯。
- 已發布 release 不得直接修改，只能建立新版本或 transaction rollback。
- Production question API 不得讀取 draft override。
- Activation code 不得保存或查詢 plaintext。
- Client telemetry 不得包含 Email、token、題目內容、答案或個人識別資料。

## 同步與資料完整性護欄

- 雲端同步必須使用伺服器 `sync_version` 與 keyset pagination；不得使用裝置時間 checkpoint、offset pagination，或用「本次查詢沒出現」推斷刪除。
- 刪除只能透過 `user_record_tombstones` 或明確伺服器事件 reconcile。
- Domain record 與 `syncIntents` 必須在同一個 per-user IndexedDB transaction；FSRS state、attempt、cloud queue 與 dead-letter 必須保留在 `reliabilityStore` IndexedDB。
- Queue mutation 必須有 event id／coalescing／重試上限；新增 mutation 類型時同步更新 reliability tests。
- 同一裝置的本機資料必須依 user id 隔離。

## 每日計畫單一來源

- 首頁與每日練習只能透過 `src/lib/dailyPlanService.ts` 建立或讀取題列。
- 所有候選池在選題前排除 `todayAnsweredIds`。
- UI 操作題數使用時間可執行值；理論覆蓋速度只能作提示，不可直接取代 quota。
- 修改演算法必須同步更新 `scripts/test-learning-engine.ts` 與 `scripts/test-daily-plan-service.ts`。

## 題庫與離線內容

- `public/data/pdf-image-quiz.json` 變更後必須執行 `npm run validate:image-data`、`npm run generate:shards` 與 `npm run generate:plan-index`，並提交 generated manifest、question index、shards 與 release source；production build 不得包含原始編輯 JSON 或 backups。
- Bank／chapter route 不得改回載入完整題庫。
- Cache version 必須來自 release manifest／content hash，不得新增人工日期常數。
- 離線下載只能快取該 App 的 `question-bank-*` cache。

## PWA 與空白頁護欄

- 所有 `React.lazy()` 必須透過 `lazyWithRetry()`。
- Analytics 或非核心 widget 必須有獨立 Error Boundary。
- Service Worker 不得在使用者操作途中自動接管舊分頁。
- Recovery cleanup 只能清除目前 App scope 與 app-owned cache；不得清除 IndexedDB／localStorage。
- `index.html`、`sw.js` 與 manifest 不得使用 immutable 長快取；只有 hash assets 可 immutable。

## CSS 與效能護欄

- 不得新增 `premium-vXX.css` 或其他版本式覆蓋檔；現行主題只從 `theme-current.css` 載入。
- 新樣式優先放入 component/page 對應檔，避免新增 `!important`。
- 進度條、錯誤次數、正解／答錯顏色修改必須保留 integrity contract 與 Playwright 驗證。
- 首頁不得載入完整 crop payload。
- 大型列表使用 progressive rendering、virtualization 或 `content-visibility`。
- 修改 Vite、主 bundle 或全域 CSS 後必須通過 `npm run test:bundle` 與 `npm run test:css`。
