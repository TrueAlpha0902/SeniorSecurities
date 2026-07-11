# SeniorSecurities Current State

更新時間：2026-07-11 10:52:56 +08:00
目前分支：`main`
本次收尾前 commit：`4913192`

## 本次已完成驗證

- `npm cache verify`
- `npm ci`
- `npm run lint`
- `npm run test:calculator`
- `npm run validate:data`
- `npm run build`

## 已完成狀態

- 最新前端與 API 可通過 production build。
- Supabase 最新 migrations 已套用。
- 管理員彙總與外鍵索引已完成。
- 每日題列、離線同步、後台管理與計算機功能已存在。
- 已建立 Codex 低 Token 交接文件。

## 尚未開始的大型後續計畫

- AnswerAttempt append-only 作答事件
- QuestionLearningState
- Leitner／FSRS 長期記憶排程
- user_id RBAC 與 MFA
- 題庫雙人核准與 immutable release
- 三科 150 題／210 分鐘完整模擬考
- 不可重放的伺服器端排行榜事件統計

除非使用者明確要求，不要自行開始上述大型功能。

## Codex 下次開始方式

1. 執行 `git status --short`
2. 執行 `git log -1 --oneline`
3. 閱讀本文件
4. 閱讀 `docs/AI_CHANGELOG.md` 最後一筆
5. 直接處理使用者指定的下一項工作
