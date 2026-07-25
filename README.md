# SeniorSecurities

金融證照題庫PWA，目前包含：

- 證券高業：3考科／4題庫、40章，共3,526題。
- 初階外匯：第23至47屆、2科，共3,250題。
- 合計6,776題，依證照題庫獨立開通。

v83.1延續v83的統一登入題庫API、伺服器延後模擬考批改、跨證照搜尋、文字離線章節包與收斂後資訊架構，並加強Production公開內容邊界。正式建置不公開證券掃描頁、完整靜態題庫shards或舊示範題庫。

## 開發

```bash
npm ci
npm run dev
```

## 完整驗證

```bash
npm run verify
npm run test:e2e
```

Vercel Hobby部署前會執行 `npm run check:vercel-functions`。目前公開Functions為9支，低於12支上限並保留3支餘量。`npm run build`後會以 `npm run test:public-boundary`檢查公開輸出。

## 重要文件

- `docs/CURRENT_STATE.md`：目前版本狀態
- `docs/RELEASE_REVIEW_v83_1.md`：v83.1發布前審查
- `docs/V83_1_VERIFICATION_RESULTS.md`：v83.1驗證結果
- `docs/PACKAGE_CONTENTS_v83.md`：封裝與更新方式
- `docs/FOREIGN_EXCHANGE_TEXT_QA.md`：初階外匯題文與答案稽核
- `docs/SECURITIES_TEXT_QA.md`：證券高業掃描文字化稽核
- `AGENTS.md`：Codex／AI修改規則

## 資料庫

分題庫權限沿用：

```text
supabase/migrations/20260719120000_exam_scoped_entitlements_v80.sql
```

題庫識別碼：

```text
senior-securities
junior-foreign-exchange
```
