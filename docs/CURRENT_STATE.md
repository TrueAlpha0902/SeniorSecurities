# SeniorSecurities Current State

更新日期：2026-07-11
目前版本：v73 Phase 1 資料可靠性與多帳號隔離

## v73 Phase 1 已完成

- FSRS learning attempt 與排行榜答題事件改為寫入既有的持久 cloud mutation queue；離線、斷線或短暫 RPC 失敗後會保留並重試，不再只記錄 `console.warn` 後遺失。
- 事件以 `eventId` 做 coalescing／冪等識別，避免同一題重送時在佇列中重複堆積。
- 新增 `userScopedStorage`：累積練習時間、待同步練習秒數、考試計畫、每日計畫、相似題掌握／筆記及答題設定均依登入者隔離。
- 舊版未分帳號的 localStorage 僅允許第一位登入使用者認領並遷移；其他帳號不會讀到該批資料。
- Auth 初始化、登入、註冊、登出及 auth state change 都會先切換 storage scope；登入後也會立即補送目前帳號待同步的練習秒數。
- 新增 user-scoped storage 自動測試，涵蓋帳號隔離、前綴清理與舊資料遷移。
- 新增 GitHub Actions `Verify` workflow，PR 與 main push 都會執行 `npm ci` 與完整 `npm run verify`。
- 同一更新包亦包含尚未成功套用的 v72.5 視覺修正，避免目前 production 與進度文件不一致。

## 驗證

執行：`npm run verify`

已通過：

- 前端 TypeScript
- API TypeScript
- ESLint
- 計算機核心與進階測試
- FSRS 學習引擎與 deadline plan 測試
- 多帳號 localStorage 隔離與舊資料遷移測試
- 題庫資料驗證
- Production build
- PWA generation

## 資料庫

v73 Phase 1 沒有新增 Supabase migration，也沒有新增 npm 套件。

## Codex／AI 下次開始方式

1. 執行 `git status --short`。
2. 執行 `git log -1 --oneline`。
3. 閱讀本文件。
4. 只讀取 `docs/AI_CHANGELOG.md` 最後一筆。
5. 不要先掃描整個儲存庫。
