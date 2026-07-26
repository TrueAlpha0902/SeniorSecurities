# v81 審查包內容

本包包含：

- 修改後完整專案原始碼
- 證券高業 3,526 題最終掃描文字資料
- 40 個章節題庫 shards 與每日計畫索引
- 818 張原始掃描頁
- 初階外匯既有資料與分題庫權限 migration
- OCR reconciliation、最終異常稽核、掃描來源 manifest 與 QA 文件
- 6 張實際元件預覽截圖

本包刻意排除：

- `.git`、`.vercel`
- 真實 `.env` 與任何平台憑證
- `node_modules`、`dist`
- Playwright／測試暫存輸出
- 大量內部 OCR 裁切圖與接觸表
- OCR 中間候選資料 `source-materials/securities-text-ocr-candidates.json`

本機驗證：

```powershell
npm ci
npm run validate:securities-text
npm run audit:securities-text-final
npm run test:securities-text-contracts
npm run typecheck
npm run typecheck:api
npm run lint
npm run build
npm run test:bundle
npm run test:e2e
```

此包尚未部署正式網站。
