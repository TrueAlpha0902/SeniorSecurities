# SeniorSecurities Stabilization Final Report

## 目標

本次將 v74.1 後仍存在的資料完整性、離線同步、安全治理、題庫載入、PWA 更新、回歸防護與部署驗證一次整合完成。

## 主要風險與處理結果

| 風險 | 原狀 | 完成後 |
|---|---|---|
| 雲端 partial response 誤刪 | 未回傳資料可能被視為刪除 | 分頁、穩定次排序、完成後 checkpoint、explicit tombstone |
| 舊 tombstone 誤刪重建資料 | overlap 可能同時讀到刪除與較新 live row | 比較時間戳，只套用不舊於 live row 的 tombstone |
| 大型 localStorage FSRS | 每題 stringify 全部狀態 | IndexedDB 單筆 store 與 memory cache |
| 離線事件大量重送 | 逐筆、固定重試 | 50 筆 queue batch、100 筆 RPC、退避與 dead-letter |
| 多帳號污染 | 部分 key 可能共用 | User-scoped storage 與 reliability DB per user |
| 今日題數不實用 | 理論覆蓋速度直接變操作題數 | 理論需求／時間可執行值分離 |
| 完整題庫一次載入 | 任一章節可能解析全包 | 40 個 chapter shards 與 release manifest |
| Cache version 人工維護 | 可能漏改常數 | 內容 hash 與 generated release ID |
| Draft 外洩 | 無 active release 可 fallback draft | bundled stable only |
| Publish 半套狀態 | 多次獨立 update | PostgreSQL transaction RPC |
| Activation code 明文 | 資料庫可讀取舊碼 | hash＋preview；建立時一次顯示 |
| Lazy chunk 空白頁 | 非 route lazy 未完全保護 | route／calculator／settings／analytics 統一 recovery |
| 視覺反覆消失 | 多層歷史 CSS 與缺乏 UI 測試 | current theme、CSS contracts、Playwright |
| 部署後無驗證 | build 通過不代表 production 健康 | post-deploy health check |

## 自動測試與驗收

- `npm run verify` 全部通過。
- Reliability test 以 3,500 筆 learning states 驗證容量與帳號隔離。
- DailyPlan test 驗證 compact/full 一致、快取穩定、設定失效及今日完成題目不占 quota。
- Integrity contract 驗證 tombstone、分頁、batch RPC、中央 Admin auth、無 `code_plain`、無 draft fallback、lazy recovery 及關鍵 UI selector。
- Desktop Chromium 的 App boot、calculator/settings、trial 正誤色彩與 offline reload 已在本地執行通過。
- iPad／mobile 使用 GitHub Actions 安裝的 Playwright Chromium 執行；本工作環境的系統 Chromium 受企業 URL policy／sandbox 限制，不作為 CI browser 來源。

## 部署必要條件

1. 套用 `20260712090000_stabilization_final.sql`。
2. Commit／push 全部更新。
3. GitHub Actions Verify 與 browser-smoke 必須成功。
4. Vercel Git integration 部署 main。
5. Repository variable `POST_DEPLOY_BASE_URL` 設為正式網址後，production-health 會自動執行。

## 回復策略

最終套用腳本會在 Windows TEMP 建立逐檔備份；若 `npm ci`、Supabase migration 或 `npm run verify` 失敗，會還原本次修改並停止 Git commit。GitHub push 前不會呼叫本機 Vercel CLI。
