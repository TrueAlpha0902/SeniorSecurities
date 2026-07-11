# SeniorSecurities AI 工作規則

## 最低讀取範圍

1. 先執行 `git status --short` 與 `git log -1 --oneline`。
2. 讀取 `docs/CURRENT_STATE.md`。
3. 只讀取 `docs/AI_CHANGELOG.md` 最後一筆。
4. 架構、同步、效能或安全任務再讀取 `docs/OPTIMIZATION_ROADMAP.md`。
5. 除非任務需要，不要預先掃描整個儲存庫、舊版 README、備份 JSON、桌面 EXE 或建置產物。

## 修改後必做

執行 `npm run verify`，再更新 `docs/CURRENT_STATE.md` 與 `docs/AI_CHANGELOG.md`。PR 與 main push 必須通過 GitHub Actions `Verify`。
涉及資料庫時，新增 migration，不可直接改寫已套用的 migration。

## 資料與安全

- 不得提交 `.env`、私鑰、service-role key、Vercel token、`.vercel`、`supabase/.temp`、`node_modules`、`dist` 或 log。
- 題庫說明必須保留完整原文；OCR 內容只能標示為未校對、已逐字校對或需複查。
- 管理權限以 `user_id` 角色為主，Email 僅保留主要管理員 bootstrap fallback。
- 已發布題庫 release 不得直接修改，只能建立新版本或回滾。

## 每日計畫單一來源

- 首頁與每日練習只能透過 `src/lib/dailyPlanService.ts` 建立或讀取今日題列。
- 不得在 `HomePage.tsx`、`ImageQuizPage.tsx` 或其他頁面複製 FSRS 到期判斷、錯題排序、科目平衡或 daily-plan localStorage 解析。
- 修改每日計畫演算法時必須同步更新 `scripts/test-daily-plan-service.ts`。
