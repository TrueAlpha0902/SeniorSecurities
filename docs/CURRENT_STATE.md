# SeniorSecurities Current State

更新日期：2026-07-11
目前版本：v72.5 首頁置中與作答視覺修正

## v72.5 已完成

- 首頁底部的透明芙莉蓮插圖改為真正置中顯示，避免偏左。
- 首頁倒數卡再往右微調。
- 章節練習卡片中的進度條恢復正常顯示。
- 題目頁「錯誤次數」紅色徽章恢復顏色。
- 題目作答後的正解／答錯顏色恢復。
- 移除「作答把握程度」整個區塊。

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

v71 沒有新增 Supabase migration，不需執行 `supabase db push`。

## 資產說明

本版本保留既有角色圖像，只以 CSS／React 編排同一空間的連續動畫。受限於現有讀書、步行與睡眠關鍵姿勢數量，效果為高品質網頁合成動畫，而不是逐幀手繪電影動畫。

## Codex／AI 下次開始方式

1. 執行 `git status --short`。
2. 執行 `git log -1 --oneline`。
3. 閱讀本文件。
4. 只讀取 `docs/AI_CHANGELOG.md` 最後一筆。
5. 不要先掃描整個儲存庫。
