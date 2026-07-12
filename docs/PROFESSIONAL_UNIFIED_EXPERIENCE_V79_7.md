# v79.7 專業一致化體驗

## 目標

以一致的留白、對稱網格、單一主色與清楚資訊層級，統一排行榜、管理控制中心、會員活動、模擬考與題目編輯器。

## 主要成果

- 排行榜支援使用者自助頭像；上傳前在瀏覽器裁切為 320×320 WebP。
- 前三名固定使用金牌、銀牌、銅牌視覺，不再顯示重複的個人成就摘要。
- 管理會員改用雙欄資訊卡，僅以頭像綠燈表示正在使用，不顯示 Online／Offline 字樣。
- 管理控制中心 KPI 對齊為帳號、授權、作答、投入時間。
- 模擬考設定整併成單一卡片，科目卡與紀錄卡使用一致的半徑、陰影與間距。
- 題目編輯器只載入選定章節，並將本次修改、儲存、發布集中在可見工作列。
- 主要管理員可直接發布目前修改；發布建立 release、items、active pointer 與 audit event 皆在同一資料庫交易中完成。

## 安全邊界

- 一鍵發布僅限 `primary_admin`。
- 發布允許 AAL1；回滾、管理員刪除／停用等破壞性操作仍要求 AAL2。
- 頭像只能寫入目前登入使用者自己的 storage 路徑。
- 公開排行榜只讀公開顯示名稱、頭像與學習統計，不公開 Email。

## 驗證

- 3,526 題／818 張圖片驗證。
- 40 個 chapter shards 與 daily plan index 驗證。
- TypeScript、API TypeScript、ESLint。
- CSS budget：10 files／8,968 lines／215 important declarations。
- 管理後台、裁切、同步、可靠性、Daily Plan、PWA recovery 契約測試。
- Production build、PWA generation、initial bundle 166.2 KiB gzip。
