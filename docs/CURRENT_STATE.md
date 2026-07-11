# SeniorSecurities Current State

更新日期：2026-07-11
目前版本：v72 首頁透明芙莉蓮、計算機鍵位微調與設定排版優化

## v72 已完成

- 首頁底部完整移除原本的芙莉蓮生活空間動畫、預載程式、CSS 與舊動畫素材，改為透明底 Q 版芙莉蓮「加油」插圖，直接融入 App 背景，不再額外包一張白色區塊卡片。
- 首頁工具列中的「相似題辨識訓練」更名為「相似題測驗」。
- 計算機功能列改為讓 `x` 緊鄰 `x²` 左側，並將等號移到 `%` 的右邊空位，按鈕配色與 `Ans` 相同。
- 計算機右上角工具列不再放獨立等號按鈕。
- 首頁倒數區塊往右微調，減少過度貼齊左側的感覺。
- 設定頁增加留白與卡片內距，開關卡與危險操作區更好讀、不擁擠。

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
