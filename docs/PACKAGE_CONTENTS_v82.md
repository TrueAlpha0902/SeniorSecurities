# SeniorSecurities v82 封裝內容

## 題庫

- 證券高業：3,526題文字題庫與818張來源掃描。
- 初階外匯：第23至47屆3,250題，schema v3。
- 初階外匯來源：75份PDF，存於 `source-materials/foreign-exchange-official-pdfs`；原檔名對照存於 `docs/foreign-exchange-audit/source-file-map.json`。

## v82主要程式

- `api/_data/foreign-exchange/`：25屆、50個科目shards與manifest；含複數答案、凡有作答與一律給分三種官方計分模式。
- `api/foreign-exchange/questions.ts`：受權限保護的題庫API。
- `scripts/generate_foreign_exchange_bank.py`：來源PDF重建與三引擎核對。
- `scripts/validate-foreign-exchange.ts`：3,250題完整性驗證。
- `scripts/check-vercel-function-limit.ts`：Vercel Hobby function預算檢查。
- `vercel.json`：登入稽核與管理健康檢查相容rewrite。

## 發布前文件

- `docs/RELEASE_REVIEW_v82.md`
- `docs/V82_VERIFICATION_RESULTS.md`
- `docs/FOREIGN_EXCHANGE_TEXT_QA.md`
- `docs/FOREIGN_EXCHANGE_EXPLANATION_QA.md`
- `docs/foreign-exchange-audit/foreign-exchange-source-audit.json`

## 封裝排除

- `.git`
- `.vercel`
- `node_modules`
- `dist`
- 真實 `.env*`
- 測試輸出與暫存檔
- `*.log`
- `__pycache__`與`*.pyc`

`.env.example`會保留；正式密鑰、token及密碼不包含在封裝內。
