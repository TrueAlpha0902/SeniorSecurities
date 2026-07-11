# SeniorSecurities Current State

更新日期：2026-07-11
目前版本：v70 首頁倒數、模擬考與管理權限收斂版

## v70 已完成

- 計算機底列 Ans／EXE 已交換：Ans 位於左側，EXE 位於最右側。
- 首頁每日練習恢復原始大型考試倒數層級；今日題數旁只保留無外框資訊圖示。
- 模擬考規則、設定與科目區移除非必要輔助說明，保留自訂題數與必要開關。
- 管理控制中心改為白色卡面、深藍操作與緊湊 KPI，不再使用紅色主視覺。
- 題庫發布流程已整合到「題目編輯」底部；只有主要管理員可點擊「發布題庫」。
- 權限角色只對外呈現「主要管理員」與「管理員」。
- 「管理員」工具頁只有主要管理員看得到；相關新增、停用、刪除 API 亦限制主要管理員。
- 舊的題庫覆核員／客服管理員資料會在執行時正規化為一般管理員，不需資料庫 migration。

## 驗證

執行：`npm run verify`

已通過：

- 前端 TypeScript
- API TypeScript
- ESLint
- 計算機核心與進階測試
- FSRS 學習引擎與 deadline plan 測試
- 題庫資料驗證
- Production build
- PWA generation

## 資料庫

v70 沒有新增 Supabase migration，不需執行 `supabase db push`。

## Codex／AI 下次開始方式

1. 執行 `git status --short`。
2. 執行 `git log -1 --oneline`。
3. 閱讀本文件。
4. 只讀取 `docs/AI_CHANGELOG.md` 最後一筆。
5. 不要先掃描整個儲存庫。
