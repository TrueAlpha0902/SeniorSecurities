# v80 發布前審查摘要

更新日期：2026-07-19

## 已完成

- 初階外匯第45、46、47屆，共390題。
- 題幹與選項以官方PDF內嵌Unicode文字層擷取，未使用OCR或AI補字。
- 題幹與四個選項共1,950個欄位，經`pdftotext -raw`、PyMuPDF與pypdf交叉比對。
- 390筆官方答案經三條擷取路徑核對。
- 390題各有獨立解析；逐題練習作答後顯示，模擬測驗交卷前隱藏。
- 證券高業與初階外匯採獨立entitlement、啟用碼、撤銷與到期設定。
- 學員介面已移除來源頁碼、檔名、雜湊、擷取技術及內部審核說明。
- TypeScript、API TypeScript、ESLint、CSS budget、題庫驗證、權限契約、既有學習與儲存測試、production build及bundle budget均通過。

## 尚未執行

- 尚未套用`supabase/migrations/20260719120000_exam_scoped_entitlements_v80.sql`。
- 尚未推送Git repository。
- 尚未觸發Vercel部署。
- 尚未修改正式會員權限或建立正式啟用碼。

## 測試環境限制

此工作環境的系統Chromium套用管理政策`URLBlocklist: ["*"]`，一般Playwright測試在導覽本機HTTP網址時會收到`ERR_BLOCKED_BY_ADMINISTRATOR`。因此正式URL型E2E未能在此容器完成；發布前應在未受該政策限制的本機或CI再次執行`npm run test:e2e`。

發布前預覽截圖使用實際React元件、正式CSS及正式390題資料，透過`about:blank`離線掛載，以避開該系統導覽政策；不是另行繪製的靜態設計稿。
