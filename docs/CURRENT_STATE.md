# SeniorSecurities Current State

更新日期：2026-07-11
目前版本：v67 Premium Liquid
升級基準：GitHub `main` commit `5e7dece`

## v67 已完成

- 全站視覺收斂為簡約、金融感一致的 Liquid Glass 設計系統。
- 主色統一為深海軍藍與鈷藍，降低漸層、陰影、裝飾與卡片噪音。
- 首頁移除「長期記憶進度」大型區塊；FSRS 學習引擎與今日複習入口仍保留在既有流程。
- 修復計算機開啟後可能離開可視區域的問題：改為固定置中的 modal overlay。
- 計算機改為 991EX／ClassWiz inspired 單一機身介面，包含 LCD、太陽能板、方向盤、五欄鍵盤與統一模式抽屜。
- 模擬考建立頁改為清楚的模式、題數、批改方式與科目選擇流程，修正寬螢幕排版擠壓。
- 排行榜移除大型前三名展示牆，保留個人進度、榜首摘要、名稱設定與單一榜單。
- 相似題辨識訓練降低資訊密度，保留主動作答、差異線索、錯題重做與掌握標記。

## 仍保留的核心功能

- 150 題／210 分鐘完整模擬考。
- AnswerAttempt、QuestionLearningState 與 FSRS 排程。
- user-id RBAC、TOTP MFA、主要管理員刪除啟用碼。
- 題庫 Draft → Review → 雙人核准 → Publish → Rollback。

## 驗證

執行：`npm run verify`

v67 已通過：

- 前端 TypeScript
- API TypeScript
- ESLint
- 計算機核心與進階模式測試
- FSRS 學習引擎測試
- 題庫資料驗證
- Production build 與 PWA 產生

## Codex／AI 下一次開始方式

1. 執行 `git status --short` 與 `git log -1 --oneline`。
2. 讀取本檔。
3. 只讀取 `docs/AI_CHANGELOG.md` 最後一筆。
4. 不必重新掃描整個專案。
