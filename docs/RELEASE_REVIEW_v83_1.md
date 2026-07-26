# SeniorSecurities v83.1 發布前審查

## 發布定位

v83.1 是 v83 收斂版的公開內容邊界與發布硬化更新。題庫內容、答案、解析、權限資料模型與 Supabase migration 均未變更。

## 本版修正

1. 免費試用10題改為純文字資料，來源為 `build-data/securities-text-final.json`。
2. 試用資料不再含 PDF 檔名、掃描頁路徑、裁切座標或影像 segments。
3. Production build 移除舊版示範題庫：
   - `data/banks.json`
   - `data/banks/**`
4. Production build 持續移除：
   - `pdf-pages/**`
   - `data/question-shards/**`
   - `data/pdf-image-quiz.json`
5. 新增 `test:public-boundary`，在每次 build 後檢查公開輸出。
6. 正式站健康檢查改為驗證：
   - 私有章節 shard 不可公開取得 JSON。
   - 原始掃描頁及 raw editor source 不可公開取得。
   - 未登入的證券／外匯題庫 API 必須回傳 401 或 403。
   - 免費試用資料必須是10題完整純文字。
7. `brace-expansion` 鎖定版本更新為 1.1.16／2.1.2；`npm audit` 為0項弱點。

## 題庫範圍

| 題庫 | 題數 |
|---|---:|
| 證券高業 | 3,526 |
| 初階外匯第23～47屆 | 3,250 |
| 合計 | 6,776 |

## Production 公開內容邊界

建置後公開 `dist/data` 只保留5個必要 JSON：

- `pdf-image-quiz-plan-index.json`
- `pdf-image-quiz-summary.json`
- `pdf-image-quiz-trial.json`
- `question-release-manifest.json`
- `similar-question-groups.json`

其中只有 `pdf-image-quiz-trial.json` 含10題免費試用題目、答案及解析。其餘檔案不得含題幹、選項、答案、解析或掃描座標。

完整證券章節 shard 只透過 Vercel Function `includeFiles` 提供給已登入且具 entitlement 的 `/api/questions`，不位於靜態 `dist`。

## 驗證結果

以下檢查已個別通過：

- Vercel Functions：9／12
- 初階外匯來源欄位：16,250／16,250
- 初階外匯題目：3,250／3,250
- 證券高業文字題目：3,526／3,526
- 證券高業學員文字欄位：21,156／21,156
- 題庫 shards：40章
- 免費試用：10題純文字
- TypeScript 前端
- TypeScript API
- ESLint
- CSS budget
- 模擬考契約
- 權限與受保護內容契約
- Production build
- Public content boundary
- Bundle budget
- `npm audit`：0項弱點

Production build：

- 1,922 modules
- PWA precache：87 entries／約1,804 KiB
- Initial assets：約179.3 KiB gzip
- Vercel Functions：9／12
- 公開掃描頁：0
- 公開付費章節 shard：0
- 公開舊示範題庫：0

## E2E 狀態

Playwright測試已成功列出40項測試。此容器無法完成瀏覽器導覽：

- Playwright browser CDN 在本環境無法解析。
- 系統 Chromium 對 `127.0.0.1` 套用 `URLBlocklist`，回傳 `ERR_BLOCKED_BY_ADMINISTRATOR`。

v83.1 一鍵發布器會在使用者 Windows 電腦先安裝 Playwright Chromium／WebKit並執行完整 E2E；任何測試失敗都會停止，不會部署 Production。

## 資料庫

本版沒有新增 Supabase migration。沿用：

`20260719120000_exam_scoped_entitlements_v80`

## 發布判定

來源、資料、型別、權限、公開內容邊界與 Production build 已通過。正式發布的最後閘門是使用者本機 Playwright E2E及 Vercel Production健康檢查。
## 一鍵發布包

發布器以v82、v82.1、v82.2或v83為相容基礎，先建立本機備份，再套用81個檔案、移除21個舊路徑。部署前強制執行完整verify、npm audit及Playwright E2E；部署後再執行Production健康檢查。任一閘門失敗即停止，不會把未驗證版本指向正式網域。

發布包不含平台token、資料庫密碼、service role key或真實 `.env`。v83.1沒有新增資料庫migration。

