# SeniorSecurities v87.3 重新發行版

發行識別：`v87.3-contextual-chinese-logos-reissue-20260725`

## 目的

原始 `SeniorSecurities-v87.3-contextual-logo-update.zip` 已刪除。本重新發行版依仍存留的原始 manifest、SHA-256 紀錄、發布審查與預覽契約，將目前程式碼恢復為 v87.3 的白底、藍色主要操作、中文情境 Logo 與純文字正誤狀態。

這是新的重新發行檔，不宣稱與已刪除的原 ZIP 位元組完全相同。它保留後續版本已完成的可靠性、可存取性與互動修正，只回復已確認的 v87.3 視覺與品牌契約。

## 介面契約

- 淺灰白頁面背景與白色 surface。
- 證券高業使用海軍藍／藍色主要操作。
- 初階外匯使用深綠輔助色。
- 金融證照、證券高業、初階外匯依頁面顯示各自中文名稱與向量 Logo。
- 一般練習不顯示計時；模擬考保留計時。
- 答對與答錯保留「正確／錯誤」文字，答錯時仍標示正確選項。
- 不依賴或散布字型檔。
- 不以手寫 PNG 作為可見導覽文字或品牌標籤。

## 不變更

- 證券高業與初階外匯題目、選項、答案及解析。
- 題目 ID、作答紀錄、錯題、收藏及會員權限。
- Supabase schema、RLS、migration 或任何正式資料。
- Vercel Function 架構與題庫 API。

## 發布閘門

重新發行工具在任何 GitHub／Vercel 寫入前強制執行：

1. 更新包逐檔 SHA-256。
2. v87.3 重新發行靜態契約。
3. `npm run verify`。
4. 發布模式下的 `npm run test:e2e:v93`。
5. 僅將本重新發行涉及的檔案加入 Git commit。
6. 從 GitHub main 的乾淨 clone 執行 Vercel Production 部署。

任一必要閘門失敗都會停止發布。工具不執行 Supabase 指令。
