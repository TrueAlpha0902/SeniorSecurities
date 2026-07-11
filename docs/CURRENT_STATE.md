
## v79.3 管理後台還原

- 帳號頁改由伺服器判定管理員資格，不再只依賴 `VITE_ADMIN_EMAILS` 顯示入口。
- 未設定環境管理員清單時，保留專案主要管理員帳號的相容性 bootstrap。
- 資料庫角色為 `primary_admin` 的帳號會正確取得主要管理員功能。
- 管理後台檢視可在 AAL1 使用；刪除啟用碼與管理員異動仍要求 AAL2。
- 恢復啟用碼、管理員、題庫編輯、排行榜、稽核與系統狀態等後台功能。

# SeniorSecurities Current State

更新日期：2026-07-12  
目前版本：**Complete Optimization v79 — Server Cursor、Transactional Outbox、Image Session Sync、題庫完整驗證與部署硬化**

## v79 已完成的核心優化

### 資料完整性與跨裝置同步

- 所有同步資料表新增由 PostgreSQL sequence 產生的 `sync_version`。
- 雲端讀取改為 server-authored cursor 與 keyset pagination，不再依賴使用者裝置時間或 mutable offset。
- 首次同步固定先下載 live rows 與 tombstones，再判斷是否需要 legacy bootstrap upload，降低舊資料復活風險。
- 答題、錯題、收藏、進度、一般 session、圖片測驗 session 與本機 `syncIntents` 使用同一個 per-user IndexedDB transaction。
- FSRS state、attempt 與其 cloud outbox entry 使用同一個 reliability IndexedDB transaction。
- 圖片測驗 session 已加入雲端同步、刪除 tombstone、批次上傳及同步摘要。
- Dead-letter queue 新增檢視、重新嘗試與清除操作；帳號頁可處理長期失敗事件。
- Queue 依 `nextAttemptAt` 排程，保留 event id、coalescing、batch、exponential backoff、jitter 與最大重試限制。

### 題庫品質與載入效能

- 3,526 題完整圖片題庫新增語意 validator：ID／題號唯一、答案範圍、題目與詳解裁切、圖片存在、實際尺寸及 crop 邊界。
- 修正 1 筆缺少題目裁切及 5 筆缺少詳解裁切，並調整相鄰題目避免重疊。
- Release manifest schema 2 新增 `questionId -> shardPath` 索引。
- 單章練習只下載單一 chapter shard；Daily Plan、錯題、收藏、相似題及 session 模式只 materialize 實際需要的 shards。
- 原始編輯用 `pdf-image-quiz.json` 與本機 backups 在 production build 後自動移除；管理後台改讀 content-hashed shards。
- Production 仍保留完整 PDF 頁面圖片作為共用來源；同頁多題可共用快取，避免生成數千張重複 crop 資產。

### 管理權限與發布安全

- 移除程式內硬編碼主要管理員 Email，只接受 `ADMIN_EMAILS` 環境設定及資料庫角色。
- Inactive user-id assignment 直接 fail closed，不再 fallback 到 legacy Email access。
- Configured primary admin 與敏感工具操作要求 MFA／AAL2。
- 管理員新增、停用、刪除，以及啟用碼建立／刪除，改用 transaction RPC，mutation 與 audit event 原子完成。
- Public question override API 只回傳 published release，使用 500 筆分頁、ETag 與 CDN cache；沒有 active release 時使用 bundled stable data。
- Client telemetry 不傳 query string；後端加入 body limit、來源雜湊、rate limit 與敏感值清理。

### PWA、CI 與維護性

- GitHub Actions browser job 安裝 Chromium 與 WebKit，涵蓋桌面、手機、iPad Chromium 與 iPad WebKit。
- Production health check 不再固定等待 90 秒，改為最多 8 分鐘輪詢，並驗證 CSP、cache headers、manifest schema、hashed asset、chapter shard，以及 raw editor source 未公開。
- CSS 移除 5 個未使用的歷史計算機樣式與舊 `.bak` 元件。
- 新增 CSS maintenance budget：最多 10 個 CSS 檔、9,800 行、215 個 `!important`、`glass.css` 4,900 行。
- 現況為 10 個 CSS 檔、9,574 行、204 個 `!important`。

## 完整驗證結果

已執行並通過：

```bash
npm run verify
```

結果：

- 圖片題庫 validator：3,526 題、818 張來源圖片。
- Question shards：3,526 題、40 個 chapter shards。
- Daily Plan compact index：268,395 bytes。
- Frontend TypeScript、API TypeScript、ESLint。
- CSS maintenance budget。
- Calculator、FSRS、Daily Plan、user-scoped storage。
- Reliability store：3,500 states、1,200 attempts、atomic outbox、dead-letter retry。
- v79 security／sync／deployment integrity contracts。
- App recovery 與傳統文字題庫驗證。
- Production build、PWA generation、bundle budget。
- 初始資源約 **166.5 KiB gzip**。
- Production build 不包含 `data/pdf-image-quiz.json` 或 `data/backups`。

Playwright 實際 browser suite 不包含在 `npm run verify`；GitHub Actions 會使用官方 Playwright Chromium／WebKit 執行。本工作容器的系統 Chromium 受集中式 URL block policy 限制，因此本地未宣稱 browser E2E 通過。

## 資料庫部署順序

必須依序套用尚未部署的 migrations：

```text
supabase/migrations/20260712090000_stabilization_final.sql
supabase/migrations/20260712130000_final_hardening_v79.sql
```

v79 migration 新增：

- `user_sync_version_seq`
- 各同步表 `sync_version` trigger／index
- `user_image_quiz_sessions` 與 RLS
- `image_session` tombstone type
- 原子管理員及啟用碼 RPC
- telemetry `source_hash`

## 部署驗收

1. 最終安裝腳本的 isolated `npm ci` 與 `npm run verify` 成功。
2. `supabase db push` 成功。
3. Git commit／push 成功。
4. GitHub Actions `verify` 與 `browser-smoke` 成功。
5. Vercel Git integration 部署該 commit。
6. `production-health` 成功。

在使用者尚未提供安裝完成畫面前，不能宣稱正式 Supabase、GitHub 或 Vercel 已完成更新。
