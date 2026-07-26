# v85 Verification Results

日期：2026-07-22  
結果：**通過；尚未部署。**

## 題庫與來源

```text
初階外匯來源稽核：3,250題／16,250個題幹與選項欄位
初階外匯資料與特殊計分契約：通過
證券高業文字題庫：3,526題／21,156個學員欄位
證券高業最終異常稽核：0項
證券來源圖片：818張，來源完整性通過
Question shards：3,526題／40章
Daily plan index：268,395 bytes
```

## v85 專項

```text
學員全形標點：40,656個欄位通過
人工核對相似題：19組／38題
分題庫正解模式：6個scope，預設全部關閉
資料重設：錯題／重開進度／全部刪除三層級通過
重複答案摘要：不存在
首頁搜尋與今日錯題工具：已移除
```

## 程式與產品契約

```text
Frontend TypeScript：通過
API TypeScript：通過
ESLint：通過
CSS budget：10 files／9,506 lines／211個!important
Vercel Functions：8／12
Mock exam contracts：通過
User-scoped storage與bank-scoped answer mode：通過
Reliability store與cloud queue：通過
Protected-content integrity：通過
Admin console contracts：通過
App recovery與stale-chunk routing：通過
Text-only trial：10題，SHA-256 c17455e19601cc5c3e52d27b0b640d29ca9d26ea32a40b5b7745e4c6ae480380
```

## Production build

```text
Vite：1,919 modules transformed
PWA：86 entries／約1,709.87 KiB
Initial assets：約183.5 KiB gzip
Largest JS：react-vendor，約225.4 KiB raw
Largest CSS：index，約164.1 KiB raw
Public scans：0
Paid chapter shards：0
Legacy sample banks：0
Bundle budget：通過
Public content boundary：通過
```

## 已執行命令

```bash
npm run check:vercel-functions
npm run audit:fx-source
npm run validate:fx
npm run test:fx-contracts
npm run validate:securities-text
npm run audit:securities-text-final
npm run test:securities-text-contracts
npm run validate:image-data
npm run test:shards
npm run test:plan-index
npm run test:mobile-segments
npm run test:mock-exam
npm run typecheck
npm run typecheck:api
npm run lint
npm run test:css
npm run test:calculator
npm run test:learning
npm run test:storage
npm run test:reliability
npm run test:integrity
npm run test:v83-contracts
npm run test:v84-mobile
npm run test:learner-text
npm run test:similar
npm run test:v85-contracts
npm run test:admin
npm run test:daily-plan
npm run test:recovery
npm run test:trial
npm run build
npm run test:public-boundary
npm run test:bundle
```

## 瀏覽器測試界線

本容器無法正常使用一般 URL 導覽式 Playwright，原因是系統 Chromium 套用 `URLBlocklist: ["*"]`。本版預覽使用實際元件離線掛載；正式發布前應在未受該政策限制的 Windows 或 CI 重新執行 `npm run test:e2e`。
