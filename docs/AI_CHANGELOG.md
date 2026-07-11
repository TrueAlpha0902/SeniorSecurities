# AI Change Log

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
