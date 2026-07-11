<!-- SENIOR-SECURITIES-AI-HANDOFF -->
# SeniorSecurities AI 工作規則

開始工作時：

1. 執行 `git status --short`。
2. 執行 `git log -1 --oneline`。
3. 閱讀 `docs/CURRENT_STATE.md`。
4. 只閱讀 `docs/AI_CHANGELOG.md` 最後一筆。
5. 除非任務需要，不要預先掃描整個儲存庫。

修改完成後：

- 更新 `docs/CURRENT_STATE.md`
- 在 `docs/AI_CHANGELOG.md` 追加紀錄
- 執行 lint、calculator test、data validation 與 build
- 不得提交 `.env`、金鑰、`.vercel`、`supabase/.temp`、`node_modules` 或建置快取
