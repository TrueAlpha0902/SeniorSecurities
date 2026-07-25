# v83.1 封裝內容

## 完整審查包

完整審查包包含：

- v83.1完整前端及API原始碼
- 證券高業3,526題文字資料及來源掃描
- 初階外匯第23至47屆3,250題資料及75份來源PDF
- Supabase migrations
- 題庫產生、來源稽核、公開內容邊界與契約測試
- Playwright測試案例
- v83桌面及手機預覽
- v83／v83.1發布審查與驗證文件

完整包排除：

```text
.git
.vercel
真實.env
node_modules
dist
playwright-report
test-results
coverage
臨時截圖工具
Python cache
平台token與密鑰
```

## v82／v82.1／v82.2／v83 → v83.1 一鍵發布包

發布包只包含相對v82新增或修改的81個檔案，以及應移除的20個舊路徑。發布器會：

1. 驗證所有patch檔案大小與SHA-256。
2. 驗證目標為SeniorSecurities專案。
3. 建立時間戳本機備份及還原腳本。
4. 套用v83.1並移除舊流程及舊公開示範題庫。
5. 執行 `npm ci`、`npm audit`與完整 `npm run verify`。
6. 安裝Playwright Chromium／WebKit並執行完整E2E。
7. 確認Vercel帳號及 `senior-securities`專案連結。
8. 部署Vercel Production。
9. 執行正式站健康檢查，確認私有題庫與掃描資產未公開。
10. 產生發布收據並開啟正式站。

發布包不包含任何token、密碼、`.env`或service role key，也不新增Supabase migration。
