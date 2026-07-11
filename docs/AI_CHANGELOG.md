## 2026-07-12 — v79.5 裁切專注工作區

- 將管理後台題目裁切器重排為單畫面 focus workspace，主要操作與預覽不再被低頻欄位擠壓。
- 高頻的上下移動、裁上／裁下、高度調整與跨頁接縫工具固定顯示；左右與原始座標欄位移入進階設定。
- 儲存與復原移到可見頁首；發布管理改為收合區塊。
- 新增管理後台 UI 契約，防止大型底部工具列與全展開欄位回歸。
- 無 migration、無新增 npm 套件。

## 2026-07-12 — v79.4 跨頁題目裁切工具

- 管理後台題目編輯器新增獨立上／下／左／右裁邊，不再只能移動或放大裁切框。
- 新增可選 1／5／10／20 px 步長、減寬、減高及接縫兩側同步裁切。
- 新增基於 Canvas 像素分析的上下白邊偵測，可自動壓縮跨頁題目的段落接縫。
- 新增裁切復原堆疊及目前編輯段落高亮。
- 新增 PDF crop editor 自動測試並納入 `npm run verify`；無 migration、無新增 npm 套件。

## v79.3 — 管理後台入口與權限相容性修正

- 修正移除前端硬編碼管理員 Email 後，帳號頁「管理後台」入口消失的回歸。
- 改為呼叫受保護的 `/api/admin/tools?tool=access` 判定管理員角色。
- 修正資料庫 `primary_admin` 未被 `isPrimaryAdmin` 正確認定的問題。
- 恢復一般管理員建立與查看啟用碼；破壞性操作維持主要管理員與 MFA 保護。
- 新增主要管理員 bootstrap migration 與管理後台契約測試。

# AI Change Log

## 2026-07-12 — Complete Optimization v79

- 雲端同步由裝置時間／offset 改為 PostgreSQL `sync_version` server cursor 與 keyset pagination。
- 首次同步改為 download-first；live rows 與 tombstones 依 sync version reconciliation。
- 一般學習資料與 local sync intent 使用同一個 per-user IndexedDB transaction；FSRS state／attempt／outbox 亦為原子寫入。
- 圖片測驗 session 納入雲端同步、tombstone、批次 queue 與帳號同步摘要。
- Dead-letter queue 新增列出、重新嘗試、清除及帳號頁復原介面。
- 題庫 manifest 升級 schema 2，加入 question-to-shard index；Daily Plan、錯題、收藏、相似題與 session 只載入所需 shards。
- 新增 3,526 題／818 張圖片的完整 crop validator，修復 6 筆空白裁切及相鄰題目重疊。
- 移除 production build 中的完整編輯來源 JSON／backups；管理後台題目編輯器改從 hashed shards 載入。
- 移除 hard-coded admin Email，inactive assignment fail closed；敏感 admin／activation mutation 改為 AAL2 transaction RPC。
- Public override API 使用 published-only、分頁、ETag 與 CDN cache。
- Telemetry 移除 query string，加入 body size、source hash、rate limit 與敏感值清理。
- GitHub Actions 增加 WebKit；production health 改為輪詢並驗證安全與快取標頭。
- 移除未使用歷史計算機 CSS／bak，新增 CSS budget；完整 `npm run verify` 通過。

## 2026-07-11 — Stabilization Final（v78）

- 雲端同步改為明確分頁、增量 checkpoint、explicit tombstone、批次初始上傳與安全 reconciliation，消除 partial response 誤刪本機紀錄的風險。
- FSRS state、attempt、cloud mutation queue、sync metadata 與 dead-letter 搬到 IndexedDB；加入 coalescing、指數退避、jitter、批次 RPC 及 3,500-row 測試。
- Daily Plan 排除今日已完成題目後再選 quota，並將全題庫理論覆蓋速度與每日時間可執行題數分離。
- 題庫改為 content-hashed release manifest 與 40 個章節 shard；設定頁新增按科目離線下載／清除。
- Admin API 統一中央角色驗證，高風險操作強制 AAL2；publish／rollback 改為 transaction RPC；Production 禁止 draft fallback。
- Activation code 只保存 hash／preview，舊明文由 migration 清空；新增 privacy-safe client telemetry 與管理工具系統健康檢查。
- Calculator、Settings、Analytics 與 routes 全部使用 lazy chunk recovery；Service Worker update state 持久化並限制 cache cleanup scope。
- 合併歷史主題 import，加入 CSP/HSTS 等標頭、Playwright desktop/iPad/mobile、offline、axe、production health check、bundle 與 integrity contracts。
- `npm run verify` 全部通過；Desktop Chromium smoke／trial answer colors／offline reload 本地通過。
- 新增 migration `20260712090000_stabilization_final.sql` 與 Playwright／axe／fake-indexeddb 開發相依套件。

## 2026-07-11 — v74.1 Blank-Screen Recovery

- 將 PWA 更新從背景強制接管改為提示式更新，避免新版 Service Worker 接管仍執行舊版 lazy chunks 的分頁。
- 新增 `lazyWithRetry`，動態 import／chunk 載入失敗時安全自動重新載入一次。
- 新增 `AppErrorBoundary` 與全域 promise／script error recovery，錯誤時顯示可操作的復原畫面。
- 新增更新通知，使用者可在安全時機主動更新 App。
- 補上 Vercel HTML／Service Worker cache headers，hash assets 使用 immutable cache。
- 新增 `test:recovery` 並納入完整驗證；無 migration、無新增 npm 套件。

## 2026-07-11 — v74 Final Performance

- 首頁每日規劃改讀約 268 KB 的 compact question index，不再載入約 4.3 MB 完整 crop payload。
- 新增規劃索引自動生成與 freshness check，並驗證 compact／full question object 產生完全相同題列。
- 計算機、設定視窗、Analytics 與 `ts-fsrs` 改為延遲載入；學習狀態讀取拆成不依賴排程引擎的輕量模組。
- learning-state localStorage 加入 session memory cache，避免重複 JSON parse。
- Service Worker 延後到首屏後註冊，下一題 PDF 預抓改用實際版本化 URL。
- 首頁透明芙莉蓮由 PNG 改為 WebP，約從 1.02 MB 降至 126 KB。
- 全題目清單改為 48 題漸進呈現，長列表加入 `content-visibility`。
- Vite 改用 ES2022、移除 module-preload polyfill、刪除舊動畫 cache，新增 bundle-size budget。
- 無新增 migration、無新增 npm 套件。

## 2026-07-11 — v73 Phase 2.1 驗證相容性修正

- 移除 `ImageQuizPage.tsx` 未使用的 `WrongQuestionRecord` 型別 import。
- 修正 DailyPlanService 測試在 `noUncheckedIndexedAccess` 下的型別錯誤。
- Node 測試 TypeScript 設定加入 `vite/client`，讓共用 DailyPlanService 的型別依賴可完整建置。
- ESLint 與 Git 忽略本機 `update-backups`，避免備份檔影響驗證。
- 完整 `npm run verify` 已通過；無 migration、無新增 npm 套件。

## 2026-07-11 — v73 Phase 2 DailyPlanService 單一來源

- 新增共用 `DailyPlanService`，首頁與每日練習頁使用同一份當日不可變題列。
- 統一 FSRS 到期判斷、錯題排序、新題配置、三科平衡、交錯順序、快取讀寫與剩餘題數計算。
- 快取新增題庫 universe signature 與完整 plan snapshot，避免題庫更新或今日作答後造成首頁與練習頁漂移。
- `DAILY_PLAN_STORAGE_VERSION` 更新至 42，舊快取安全失效。
- 刪除 HomePage／ImageQuizPage 兩套重複 Daily Plan 邏輯。
- 新增 `test:daily-plan` 並納入 `npm run verify`。
- 無 Supabase migration、無新增 npm 套件。

## 2026-07-11 — v73 Phase 1 資料可靠性與多帳號隔離

- FSRS learning attempt 與排行榜 answer event 納入持久 cloud mutation queue，離線及短暫同步失敗後可重新補送。
- learning／leaderboard mutation 以 `eventId` coalescing，保留既有後端冪等語意。
- 新增 `userScopedStorage`，隔離練習秒數、考試計畫、每日計畫、相似題資料與答題設定。
- 舊 global localStorage 採單一 owner 遷移，防止第二個帳號誤讀第一個帳號的資料。
- Auth 切換帳號時同步切換 storage scope，登入後補送待同步練習秒數。
- 新增 `test:storage` 並納入 `npm run verify`。
- 新增 GitHub Actions Verify workflow，PR／main push 自動執行完整驗證。
- 無 Supabase migration、無新增 npm 套件。

## 2026-07-11 — v72.5 首頁置中與作答視覺修正

- 首頁透明芙莉蓮插圖改為置中顯示，並把倒數區塊再往右微調。
- 修正章節練習進度條顯示成空白的問題。
- 恢復題目頁「錯誤次數」徽章的紅色樣式。
- 恢復作答後答案正確／錯誤的顏色樣式。
- 移除「作答把握程度」區塊。
- 無新增 migration、無新增 npm 套件。

## 2026-07-11 — v72 首頁透明芙莉蓮、計算機鍵位微調與設定排版優化

- 首頁底部完整移除原本的芙莉蓮動畫元件、預載程式、CSS 與舊動畫素材，改為透明底 Q 版芙莉蓮「加油」插圖，直接融入背景。
- 首頁工具按鈕文案「相似題辨識訓練」改為「相似題測驗」。
- 計算機功能鍵重新排序，讓 `x` 緊鄰 `x²` 左側，並把等號移到 `%` 右邊空位。
- 等號按鈕改用與 `Ans` 相同的主色，右上角工具列的等號按鈕移除。
- 首頁倒數區塊往右微調，改善過度靠左的視覺感。
- 設定頁增加留白、卡片內距與危險操作按鈕的獨立性，降低擁擠感。
- 無新增 migration、無新增 npm 套件。

## 2026-07-11 — v66 完整學習與治理升級

- 重新設計統一 ClassWiz 風格計算機，補齊科學、工程、統計、矩陣、向量、方程式及財務模式。
- 重新設計排行榜與模擬考建立頁；完整模考為 150 題／210 分鐘。
- 模考加入延後批改、倒數、答題卡、待檢標記、信心標記與同場錯題重練。
- 相似題改為隱藏答案的主動比較學習，加入錯因、筆記、熟練度與重做流程。
- 導入 append-only attempt、FSRS 學習狀態、雲端摘要及不可重放排行榜事件。
- 完成 user-id RBAC、TOTP MFA／AAL2、主要管理員刪除啟用碼與管理稽核。
- 完成題庫雙人核准、immutable release 與 rollback。
- 新增 migration、API typecheck、FSRS 測試及 `npm run verify`。
- 驗證結果：前後端 typecheck、lint、calculator、learning、question data、production build 全部通過。

## 2026-07-11 — v67 Premium Liquid 視覺收斂與計算機修復

- 全站統一為簡約金融感 Liquid Glass 色系與元件層級。
- 首頁移除長期記憶大型資訊區，降低首頁資訊噪音。
- 計算機改為固定置中 overlay，修復可能無法看見／叫不出的問題。
- 計算機外觀重做為 991EX／ClassWiz inspired 單一機身與五欄按鍵配置。
- 模擬考頁修正控制區跑版，簡化模式、題數與科目卡片。
- 排行榜移除展示型前三名卡牆，改為單一高資訊密度榜單。
- 相似題頁統一視覺並降低資訊卡密度。
- 完整 verify 全部通過。

## 2026-07-11 — v68 深藍極簡與計算機重做

- 全站恢復單一深藍主題，移除鈷藍及裝飾性漸層。
- 每日練習首頁只顯示應做題數，其餘資訊收進說明視窗。
- 計算機改為精簡單一介面，新增方程式解 x、上下式分數輸入、歷史與按鍵回饋。
- 新增兩個指定金融方程式及巢狀分數的自動測試。
- 模擬考只保留單科自訂題數，移除快速題數、完整三科模考、倒數及自動交卷。
- 模擬考規則移至頁首，移除頁首 KPI 統計。
- 完整 `npm run verify` 通過；無資料庫 migration。

## 2026-07-11 — v69 deadline plan, floating calculator and admin contrast repair

- 每日練習改為依「尚未作答題數 ÷ 考試前完整練習日」計算，不再受每日分鐘上限壓低；舊的 v68 每日計畫快取會自動失效重建。
- 首頁保留考試倒數，說明按鈕縮成資訊圖示並緊鄰今日題數。
- 計算機合併一般運算與解 x；含等號的輸入自動解方程式，其他輸入直接計算。
- 計算機改為桌面／平板可拖曳浮動視窗，答題頁可一邊看題目一邊輸入；手機維持底部面板。
- 等號移到上方函數鍵，底部改為 EXE 與 Ans；移除輸入框範例及操作說明。
- 修復管理後台因全站移除漸層後白字白底，以及帳號頁登出按鈕背景消失的問題；管理區恢復實心紅色高對比樣式。
- 完整 verify 通過，無 Supabase migration、無新增 npm 套件。

## 2026-07-11 — v70 countdown, mock exam and admin governance refinement

- 計算機底列交換 Ans／EXE 位置，Ans 在左、EXE 在最右。
- 首頁每日練習恢復大型考試倒數區，說明按鈕改為無外框的小型資訊圖示。
- 模擬考移除規則、設定與科目標題下方的輔助說明，只保留必要標題與控制項。
- 管理控制中心移除紅色主視覺，改為白色金融儀表板與深藍操作層級。
- 發布流程合併到題目編輯頁，正式發布按鈕固定在發布區底部，僅主要管理員可用。
- 管理員角色收斂為「主要管理員／管理員」；管理員帳號頁只對主要管理員顯示，API 亦強制檢查。
- 完整 `npm run verify` 通過；無 Supabase migration、無新增 npm 套件。

## 2026-07-11 — v71 無縫首頁與角色生活空間動畫

- 首頁倒數與今日練習統一為無分隔線的白色卡片。
- 計算機顯示區改白底，等號移到右上工具列，x²／xʸ 同列。
- 首頁角色動畫重構為固定房間合成場景，家具從第一幀完整存在。
- 完全沿用既有角色資產，透過交疊淡化、走路循環、呼吸、燈光、窗簾、粒子與鏡頭微動作，建立 54 秒連續生活循環。
- 動畫離開視窗或分頁隱藏時自動暫停，並支援 reduced-motion。
- 完整 `npm run verify` 通過；無 Supabase migration、無新增 npm 套件。
