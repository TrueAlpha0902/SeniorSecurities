## v79.16 模擬考批改設定與正解模式一致化

- 「交卷後統一批改」改為使用者分帳號持久設定，離開模擬考頁再返回不會自行恢復開啟。
- 正解模式啟用時，模擬考會自動採即時顯示正解與解析，並停用互相衝突的統一批改開關。
- 既有 deferred 模擬考 session 在正解模式開啟後，也會立即遵循正解模式。
- 開關 OFF 為淺灰、ON 為藍綠，狀態與實際行為一致。
- 無 Supabase migration、無新增 npm 套件。

## v79.14.1 原頁透明裁切窗 CSS 預算修正

- 保留紅色實線框、中間透明洞口與框外淡色遮罩。
- 將裁切窗規則改為更精確的高 specificity selector，只保留 2 個必要的 `!important`。
- 全專案 `!important` 數量維持 CSS maintenance budget 上限 215，不再因裁切修正造成驗證失敗。
- 無 Supabase migration、無新增 npm 套件。

## v79.14 原頁透明裁切窗

- 原頁裁切定位改為紅色外框、中間完全透明，來源文字與版面不再被色塊遮住。
- 目前裁切範圍外側加入低透明度暗色遮罩，強化定位但不影響裁切區內容閱讀。
- 同頁其他段落維持透明紅色虛線框；圖例也改為透明紅框。
- 使用 `!important` 鎖定透明背景，避免全站 `.is-active` 樣式再次覆蓋成實心主色。
- 無 Supabase migration、無新增 npm 套件。

## v79.13 題目編輯器效能優化

- v79.12 的草稿題目／解析雙預覽與原頁紅框定位完整保留。
- 題目編輯器開啟時先讀取輕量草稿索引，不再逐筆下載所有尚未發布的 JSON；進入章節後只讀取該章節需要的草稿。
- 正式題庫 override 改為依目前章節的題目 ID 分批取得，避免每次進入編輯器下載整個發布版本。
- PDF 裁切預覽改用穩定 React key；移動或裁切時不再銷毀並重新解碼同一張原頁圖片。
- 草稿雙預覽改為 deferred rendering，先顯示操作控制，再於下一個畫面週期掛載高解析圖片；非作用中預覽及原頁定位使用低優先載入。
- 預覽卡加入 memo、CSS containment 與 content-visibility，降低不相關狀態更新造成的重排與繪製。
- 本次修改清單使用輕量 ID 索引，切換到修改題目時才載入對應章節內容。
- 完整 `npm run verify` 通過；無 Supabase migration、無新增 npm 套件。

## v79.12 題目草稿雙預覽與原頁紅框定位

- 題目編輯器同時顯示「草稿題目」與「草稿解析」的 App 成品預覽，尚未儲存的裁切調整也會即時反映。
- 新增原始 PDF 頁面定位預覽，完整呈現目前頁面，並以紅色實線框標示正在調整的裁切區域；同頁其他段落使用紅色虛線框輔助辨識。
- 草稿題目／解析預覽可直接切換目前編輯模式，減少在工具列與預覽間來回確認。
- 強化「裁上／裁下」按鈕為深藍綠底白字；「減高／加高」維持白底深色字，避免低對比按鈕難以辨識。
- 完整 `npm run verify` 通過；無 Supabase migration、無新增 npm 套件。

## v79.11 更新可靠性、頭像自訂裁切與扁平化管理圖示

- 「更新 App」改用具 3 秒上限的 Service Worker 啟用流程；即使更新 promise 或 controller change 沒有回應，也會安全重新載入，並立即顯示「更新中…」。
- 排行榜頭像改為使用者選圖後先進入裁切視窗，可直接拖曳位置、調整縮放、重設並確認 320 × 320 裁切結果後再上傳。
- 移除排行榜資料區「自動裁切／不公開 Email」說明文字，保留乾淨的名稱與頭像操作。
- 管理控制中心盾牌與營運摘要符號移除白色立體方塊、邊框與陰影，改為透明底扁平線條，直接融入白色背景。
- 無 Supabase migration、無新增 npm 套件。

## v79.10 管理圖示與獎牌緞帶協調修正

- 排行榜金、銀、銅獎牌保留各自金屬色，三者緞帶統一改為紅色漸層。
- 管理控制中心標題圖示與四項營運摘要圖示改為白底、細框與低陰影，移除藍色塊感並維持圖示辨識度。
- 在線人數圖示仍使用綠色線條，但底色與其他圖示一致為白色。
- 無 Supabase migration、無新增 npm 套件。

## v79.9 管理摘要、排行榜獎牌與帳號精簡

- 管理控制中心摘要移除「有效授權」，改為「目前在線」，並修正練習投入時間在窄欄位被省略的問題。
- 排行榜前三名改用獨立透明底 Q 版金／銀／銅獎牌 SVG，榮耀殿堂與完整排名共用相同獎牌識別。
- 帳號頁與管理工具移除多因素驗證設定；管理操作改以主要管理員／管理員角色權限與確認流程保護。
- 無 Supabase migration、無新增 npm 套件。

## v79.8 介面精修與頭像載入修正

- 模擬考測驗紀錄統一右側操作欄寬度，完成與未完成紀錄保持水平對齊。
- 「專業模擬考」更名為「模擬考」，移除冗長說明並精簡控制台。
- 修正排行榜頭像被 CSP 阻擋而無法顯示的問題，並加入圖片載入失敗的文字 fallback。
- 排行榜榮耀殿堂改為中性白底，由獎牌圖示本身呈現金、銀、銅，不再使用文字或卡片底色辨識。
- 移除排行榜所有「本期」字樣，重新整理完整排行列的資訊層級。
- 帳號頁同步區改為純白、低框線的兩欄狀態列。
- 管理控制中心改為單一摘要列；會員目錄改為橫向資料列，只顯示必要資訊，其餘內容保留在點擊後的詳細抽屜。
- CSS 維護預算維持在 10 個檔案、9,246 行、215 個 `!important`。

## v79.7 專業一致化體驗

- 排行榜移除多餘的個人成就摘要，前三名明確使用金牌、銀牌與銅牌，並新增使用者自助頭像上傳、裁切、壓縮與移除。
- 管理後台會員目錄改為對稱資訊卡，移除 30 秒同步與 Online／Offline 文字徽章，只在正在使用的會員頭像保留綠燈。
- 管理控制中心改用帳號、授權、累積作答與練習投入四項營運指標。
- 模擬考設定整併為單一專業控制台，統一題數、抽題策略與批改方式。
- 題目編輯器只載入目錄與目前章節，保留單畫面裁切工作區；上方直接顯示本次修改、儲存修改與一顆發布題庫按鈕。
- 題庫發布取消第二人核准流程，由主要管理員直接將目前已儲存修改原子發布；發布不要求 MFA，回滾與破壞性管理操作仍要求 MFA。
- 新增 leaderboard avatar storage migration 與 direct publication transaction RPC。
- CSS 維護預算目前為 10 個檔案、8,968 行、215 個 `!important`。

## v79.6 管理體驗與學習榮耀介面

- 主要管理員正式發布已核准題庫時不再要求 MFA；第二人核准與回滾仍維持既有安全驗證。
- 帳號頁學習同步縮減為雲端狀態、最後同步時間與立即同步按鈕。
- 管理控制中心重新整理資訊層級、營運 KPI、會員學習指標與正確率進度。
- 移除「90 秒內有心跳」實作文字，改為使用者可理解的即時狀態。
- 學習排行榜新增個人成就提示、前段百分比、榮耀殿堂與前三名獎台。

## v79.5 裁切專注工作區

- 題目編輯器改為單畫面雙欄工作區，左側只保留高頻裁切操作，右側使用可獨立捲動的大型即時預覽。
- 段落、題目／解析、步長、自動裁白邊、自動壓縮接縫、復原與儲存集中到上方工具列。
- 圖片路徑、頁碼、X／Y、原頁尺寸、左右調整、段落新增／移除及恢復部署版本移入預設收合的「進階設定」。
- 題庫發布管理改為預設收合，避免占用裁切工作區。
- 移除底部大型黏附儲存列，讓預覽與控制在一般桌面高度內可同時操作。

## v79.4 跨頁題目裁切工具

- 題目編輯器新增 1／5／10／20 px 可調步長。
- 新增裁上、裁下、裁左、裁右，可獨立縮短截圖邊界，不再只能移動整個段落。
- 新增減寬、減高及跨頁接縫兩側同步裁切。
- 新增瀏覽器端白邊偵測，可自動裁除單一段落上下白邊，或壓縮前一段與本段的跨頁接縫。
- 新增最多 30 步裁切復原，並在預覽中標示目前編輯段落。
- 新增 `test:crop-editor`，驗證裁邊、頁面邊界、接縫與白邊偵測。


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
- Configured primary admin 與敏感工具操作原則上要求 MFA／AAL2；已完成雙人核准的正式發布可由 primary admin 直接執行。
- 管理員新增、停用、刪除，以及啟用碼建立／刪除，改用 transaction RPC，mutation 與 audit event 原子完成。
- Public question override API 只回傳 published release，使用 500 筆分頁、ETag 與 CDN cache；沒有 active release 時使用 bundled stable data。
- Client telemetry 不傳 query string；後端加入 body limit、來源雜湊、rate limit 與敏感值清理。

### PWA、CI 與維護性

- GitHub Actions browser job 安裝 Chromium 與 WebKit，涵蓋桌面、手機、iPad Chromium 與 iPad WebKit。
- Production health check 不再固定等待 90 秒，改為最多 8 分鐘輪詢，並驗證 CSP、cache headers、manifest schema、hashed asset、chapter shard，以及 raw editor source 未公開。
- CSS 移除 5 個未使用的歷史計算機樣式與舊 `.bak` 元件。
- 新增 CSS maintenance budget：最多 10 個 CSS 檔、9,800 行、215 個 `!important`、`glass.css` 4,900 行。
- 現況為 10 個 CSS 檔、9,730 行、214 個 `!important`。

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
