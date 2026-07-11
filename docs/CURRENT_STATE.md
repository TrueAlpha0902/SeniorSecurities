# SeniorSecurities Current State

更新日期：2026-07-11
目前版本：v73 Phase 2.1 DailyPlanService 單一來源

## v73 Phase 2.1 已完成

- 新增 `src/lib/dailyPlanService.ts`，首頁與每日練習頁不再各自計算今日題數與題目清單。
- 首頁載入時會建立或讀取當日不可變題列；進入每日練習後直接沿用完全相同的 `questionIds`、分類與規劃快照。
- 今日完成題目後，只從既有題列扣除已完成項目，不會因重新整理、返回首頁或切換頁面而重抽題目。
- 每日計畫快取加入題庫 universe signature；題庫 release 在同一天變更時會自動失效重建。
- 快取保存完整 `SmartStudyPlanStats` 快照，避免作答後首頁倒數說明與練習頁的目標數量發生漂移。
- `DAILY_PLAN_STORAGE_VERSION` 提升至 42，舊版重複規劃快取會安全失效。
- 移除 `HomePage.tsx` 與 `ImageQuizPage.tsx` 內重複的選題、FSRS 到期判斷、科目平衡與快取解析程式。
- 新增 `test:daily-plan`，驗證首頁／每日練習題列一致、今日完成扣除、快取穩定及設定變更失效。
- 修正 Phase 2 初版的未使用型別 import、DailyPlan 測試索引型別，以及 Node 測試環境的 Vite `ImportMeta` 型別。
- ESLint 忽略本機 `update-backups`，避免備份檔干擾正式驗證。

## 前一階段仍有效

- FSRS／排行榜事件使用持久 cloud mutation queue。
- 練習時間、考試設定、每日計畫、相似題資料與 App 設定均依登入帳號隔離。
- GitHub Actions `Verify` 會在 PR 與 main push 執行完整驗證。

## 驗證

執行：`npm run verify`

驗證範圍：

- 前端 TypeScript
- API TypeScript
- ESLint
- 計算機測試
- FSRS 學習引擎與 deadline plan 測試
- 多帳號 storage 隔離測試
- DailyPlanService 單一來源與快取一致性測試
- 題庫資料驗證
- Production build 與 PWA generation

## 資料庫

v73 Phase 2 沒有新增 Supabase migration，也沒有新增 npm 套件。

## Codex／AI 下次開始方式

1. 執行 `git status --short`。
2. 執行 `git log -1 --oneline`。
3. 閱讀本文件。
4. 只讀取 `docs/AI_CHANGELOG.md` 最後一筆。
5. 架構任務再讀取 `docs/OPTIMIZATION_ROADMAP.md`。
6. 每日計畫相關修改必須從 `src/lib/dailyPlanService.ts` 開始，不得在頁面重新建立第二套選題邏輯。
