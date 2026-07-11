# AI Change Log

## 2026-07-11 — v66 完整學習與治理升級

- 重新設計統一 ClassWiz 風格計算機，補齊科學、工程、統計、矩陣、向量、方程式及財務模式。
- 重新設計排行榜與模擬考建立頁；完整模考為 150 題／210 分鐘。
- 模考加入延後批改、倒數、答題卡、待檢標記、信心標記與同場錯題重練。
- 相似題改為隱藏答案的主動比較學習，加入錯因、筆記、熟練度與重做流程。
- 導入 append-only attempt、FSRS 學習狀態、雲端摘要及不可重放排行榜事件。
- 完成 user-id RBAC、TOTP MFA／AAL2、主要管理員刪除啟用碼與管理稽核。
- 完成題庫雙人核准、immutable release 與 rollback。
- 新增 migration、API typecheck、FSRS 測試及 `npm run verify`。
- 驗證結果：前後端 typecheck、lint、calculator、learning、question data、production build 全部通過。

## 2026-07-11 — v67 Premium Liquid 視覺收斂與計算機修復

- 全站統一為簡約金融感 Liquid Glass 色系與元件層級。
- 首頁移除長期記憶大型資訊區，降低首頁資訊噪音。
- 計算機改為固定置中 overlay，修復可能無法看見／叫不出的問題。
- 計算機外觀重做為 991EX／ClassWiz inspired 單一機身與五欄按鍵配置。
- 模擬考頁修正控制區跑版，簡化模式、題數與科目卡片。
- 排行榜移除展示型前三名卡牆，改為單一高資訊密度榜單。
- 相似題頁統一視覺並降低資訊卡密度。
- 完整 verify 全部通過。
