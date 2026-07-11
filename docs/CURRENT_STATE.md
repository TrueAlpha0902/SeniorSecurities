# SeniorSecurities Current State

更新日期：2026-07-11
目前版本：v74.1 Blank-Screen Recovery — 安全更新、懶載入復原與錯誤邊界

## v74.1 已完成

- 修正部署後舊分頁與新 Service Worker 交錯時，點擊懶載入頁面可能因舊 chunk 不存在而變成空白的問題。
- PWA 更新策略由自動強制接管改為使用者確認更新；新 Service Worker 不再於操作途中接管舊分頁。
- 所有 route lazy imports 改用 `lazyWithRetry`；偵測 chunk／dynamic import 錯誤時自動重新載入一次，並以 60 秒冷卻避免無限循環。
- 新增根層 `AppErrorBoundary`，非 chunk runtime error 也會顯示復原畫面，不再只留下全白頁。
- 復原畫面提供一般重新載入及「只清除 Service Worker／Cache Storage 後重載」；不清除 IndexedDB 或 localStorage 學習資料。
- 新增全域 `error`／`unhandledrejection` chunk recovery。
- 新增 App 更新通知，使用者可在完成當前操作後主動套用新版本。
- `index.html`、`sw.js` 與 manifest 改為重新驗證，hash assets 維持 immutable 長快取。
- 新增 `test:recovery` 並納入 `npm run verify`。

## v74 已完成

- 首頁不再下載與解析約 4.3 MB 的完整 PDF 題庫資料；每日規劃改讀只含 `id`／`bankId` 的 `pdf-image-quiz-plan-index.json`。
- 規劃索引目前約 268 KB，題列結果仍由同一個 `DailyPlanService` 產生；新增測試確認輕量索引與完整題目物件產生相同 `questionIds`。
- 新增 `scripts/generate-daily-plan-index.ts`，開發與建置前會自動產生索引；CI 會檢查索引是否與正式題庫一致。
- 計算機與設定視窗改為互動前預載、開啟時才下載；不再放進首次載入的主程式碼。
- Vercel Analytics 改為瀏覽器閒置後才載入。
- `ts-fsrs` 學習排程引擎改為第一次作答／同步時才動態載入；首頁只讀輕量的 learning-state store。
- learning-state store 加入記憶體快取，避免同一次瀏覽期間重複解析大型 localStorage JSON。
- Service Worker 改為首屏完成後再註冊，避免首次渲染與更新檢查競爭主執行緒與網路。
- 首頁芙莉蓮透明圖由約 1.02 MB PNG 改為約 126 KB WebP，並補上固有尺寸避免版面位移。
- 題目頁預抓下一題時使用與實際顯示相同的版本化圖片 URL，避免無效的重複下載。
- 全題目清單改為每批 48 題漸進呈現；長列表卡片使用 `content-visibility` 跳過畫面外渲染。
- Vite 目標提升至 ES2022，移除不必要的 module-preload polyfill，並把 learning／analytics 分離為延遲 chunk。
- 新增 `test:bundle`，限制首頁初始資源 gzip、最大 JS chunk 與最大 CSS，防止日後效能回退。
- 移除已不存在的首頁動畫 runtime cache 規則。

## 前一階段仍有效

- FSRS／排行榜事件使用持久 cloud mutation queue。
- 練習時間、考試設定、每日計畫、相似題資料與 App 設定均依登入帳號隔離。
- 首頁與每日練習使用同一份不可變 DailyPlanService 題列。
- GitHub Actions `Verify` 會在 PR 與 main push 執行完整驗證。

## 驗證

執行：`npm run verify`

驗證範圍新增：

- Daily-plan compact index freshness
- 輕量索引與完整題庫的題列一致性
- Production bundle-size budget

其餘仍包含前端／API TypeScript、ESLint、計算機、FSRS、多帳號隔離、DailyPlan、題庫資料、Production build 與 PWA generation。

## 資料庫與相依套件

v74 沒有新增 Supabase migration，也沒有新增 npm 套件。

## Codex／AI 下次開始方式

1. 執行 `git status --short`。
2. 執行 `git log -1 --oneline`。
3. 閱讀本文件。
4. 只讀取 `docs/AI_CHANGELOG.md` 最後一筆。
5. 效能修改必須保留 `test:bundle` 與 compact daily-plan index，不得讓首頁重新載入完整 `pdf-image-quiz.json`。
6. 每日計畫演算法仍只能從 `src/lib/dailyPlanService.ts` 修改。
