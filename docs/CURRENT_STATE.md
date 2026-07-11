# SeniorSecurities Current State

更新日期：2026-07-11
升級基準：`b65226e` 之後的 v66 功能升級

## 已完成

- 統一 ClassWiz 風格計算機：一般計算、三角／反三角、方程式、複數、進位制、矩陣、向量、統計、常態／二項分布、函數表、不等式、比例與財務公式。
- 學習排行榜重新設計，支援連續答對與累積時數兩種榜單、前三名展示、進度與響應式排版。
- 「單科隨機測驗」正名為「模擬考測驗」，並加入單科模式與 150 題／210 分鐘完整模考、延後批改、答題卡、標記待檢、交卷與錯題重練。
- 相似題改為主動辨識訓練：先作答再揭示、信心標記、錯因歸納、筆記、重做錯題與熟練度篩選。
- AnswerAttempt append-only 事件、QuestionLearningState、FSRS 排程、首頁新題／學習中／複習／已掌握摘要。
- 排行榜改用不可重放 event id 聚合。
- 管理員改用 user-id RBAC，支援 primary/admin/content reviewer/support 角色與 MFA 強制驗證。
- 帳號頁提供 TOTP MFA 設定、驗證、AAL2 升級與移除流程。
- 管理後台移除 Windows EXE 整合說明；主要管理員可永久刪除啟用碼。
- 題庫 Draft → Review → 雙人核准 → Publish → Rollback，發布內容不可變更。

## 必須套用的資料庫 migration

`supabase/migrations/20260711123000_learning_engine_and_governance_v66.sql`

尚未套用 migration 時，前端保留本機學習狀態，雲端 FSRS、不可重放排行榜、user-id RBAC 與 release workflow 會降級或不可用。

## 驗證命令

`npm run verify`

涵蓋前端 typecheck、API typecheck、ESLint、計算機測試、FSRS 測試、題庫驗證與 production build。

## 下一步

只有營運驗收：套用 migration、推送 GitHub、等待 Vercel production deployment，然後依 `docs/V66_UPGRADE_GUIDE.md` 執行 smoke test。沒有尚未實作的既定大型 Codex 計畫。
