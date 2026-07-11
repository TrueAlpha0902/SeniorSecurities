# SeniorSecurities Optimization Roadmap

更新日期：2026-07-11  
狀態：**Stabilization Final 核心計畫完成；後續進入例行維護與量測式優化。**

## Data Integrity

- [x] 雲端查詢明確分頁、穩定次排序與增量 checkpoint
- [x] Checkpoint 僅在完整 merge 後前進；舊 tombstone 不覆蓋較新 live row
- [x] Explicit tombstone，避免 partial response 誤刪本機資料
- [x] 初始上傳／outbox 批次處理
- [x] FSRS state、attempt、cloud queue、dead-letter 搬到 IndexedDB
- [x] event-id 冪等、coalescing、exponential backoff、jitter
- [x] 3,500-row、多帳號、dead-letter 自動測試
- [x] 今日已作答題目不占 Daily Plan 名額
- [x] 理論覆蓋速度與可執行每日題數分離

## Security and Release Integrity

- [x] Admin API 統一中央權限驗證
- [x] 高風險操作 primary-admin／AAL2
- [x] Publish／rollback transaction RPC
- [x] Production 禁止 draft fallback
- [x] Activation code plaintext 不落庫
- [x] CSP／HSTS／nosniff／frame／referrer／permissions headers
- [x] Privacy-safe client error telemetry
- [x] Admin system-health panel

## PWA and Performance

- [x] 所有 lazy chunks 具備 chunk recovery
- [x] Service Worker 提示式更新與 scoped cache cleanup
- [x] Release manifest／content hash cache versioning
- [x] 3,526 題拆成 40 個章節 shard
- [x] 科目離線下載與清除
- [x] Compact Daily Plan index
- [x] Lazy calculator／settings／analytics／FSRS
- [x] Progressive rendering／content-visibility
- [x] Bundle-size budgets
- [x] Production post-deploy health check

## Regression Prevention

- [x] 歷史主題 import 合併成單一 current theme
- [x] Data／security／visual CSS integrity contracts
- [x] Playwright desktop／iPad／mobile projects
- [x] Blank-screen、calculator、settings、answer colors、offline tests
- [x] axe serious／critical accessibility scan
- [x] Browser artifacts on CI

## Ongoing Maintenance Only

以下不是阻擋上線的未完成項目，而是應依實際量測啟動：

- [ ] 依 production telemetry 排名前幾名錯誤持續修正
- [ ] 題庫超過約 10,000 題後評估更細粒度 shard 或 CDN object storage
- [ ] Admin 使用者數達數萬後改用 database-native directory mirror，避免 Auth Admin pagination 成為瓶頸
- [ ] CSS 新功能逐步搬入 tokens/components/pages；禁止再新增版本式覆蓋檔
- [ ] 依真實裝置 Core Web Vitals 調整 precache 與圖片格式
