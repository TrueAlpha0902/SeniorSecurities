# SeniorSecurities Current State

更新日期：2026-07-11
目前版本：v72 首頁靜態芙莉蓮加油圖與動畫移除

## v72 已完成

- 首頁底部原本的芙莉蓮生活空間動畫已完全移除。
- 首頁底部改為單張 Q 版芙莉蓮「加油」靜態插圖。
- 移除首頁動畫 React 元件、動畫預載程式、動畫 CSS、產圖最佳化腳本與舊動畫素材。
- 新圖片使用 WebP，約 92 KB，採延遲載入與非同步解碼，避免首頁持續執行動畫與預載多張素材。
- 首頁底部圖片維持響應式置中顯示，最大寬度 380 px。
- 本次未新增 npm 套件，也沒有資料庫變更。

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

v72 沒有新增 Supabase migration，不需執行 `supabase db push`。

## 主要變更檔案

- `src/pages/HomePage.tsx`
- `src/main.tsx`
- `src/styles/glass.css`
- `public/frieren-cheer-home.webp`
- `docs/CURRENT_STATE.md`
- `docs/AI_CHANGELOG.md`

## 已移除檔案

- `src/components/FrierenAnimation.tsx`
- `src/lib/frierenStory.ts`
- `src/styles/frieren-story-v65.css`
- `scripts/optimize-frieren-story-assets.py`
- `public/animation/frieren-story/`

## Codex／AI 下次開始方式

1. 執行 `git status --short`。
2. 執行 `git log -1 --oneline`。
3. 閱讀本文件。
4. 只讀取 `docs/AI_CHANGELOG.md` 最後一筆。
5. 不要先掃描整個儲存庫。
