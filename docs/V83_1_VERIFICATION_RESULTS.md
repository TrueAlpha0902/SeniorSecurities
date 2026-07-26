# v83.1 驗證結果

更新日期：2026-07-21

## 資料、型別、權限與建置

以下檢查已個別通過：

```text
npm ci
npm audit
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
npm run test:admin
npm run test:crop-editor
npm run test:daily-plan
npm run test:recovery
npm run test:trial
npm run build
npm run test:public-boundary
npm run test:bundle
```

整合命令 `npm run verify` 在此工作環境受到單次長命令執行時間限制，於前段資料檢查後被外部終止；其所有尚未執行的組成命令已依上列順序另外執行並通過。Windows一鍵發布器不設此工具時間限制，會執行完整整合命令。

## 核心數值

```text
題庫總數：6,776
證券高業：3,526
初階外匯：3,250
Vercel Functions：9/12
免費試用：10題純文字
公開data JSON：5
公開掃描頁：0
公開付費章節shard：0
公開舊示範題庫：0
npm audit：0 vulnerabilities
Production modules：1,922
PWA precache：87 entries／1,803.77 KiB
Initial assets：179.3 KiB gzip
Largest JS：225.4 KiB raw
Largest CSS：141.9 KiB raw
```

## 更新包重建驗證

以乾淨v82完整審查包為基礎，套用v83.1更新包的81個檔案並移除20個舊路徑後，與v83.1完整來源逐檔比較：

```text
只存在完整來源的檔案：0
只存在重建來源的檔案：0
內容SHA-256不同的檔案：0
```

## E2E環境限制

Playwright可發現40項瀏覽器測試。本容器的系統Chromium受到管理政策 `URLBlocklist: ["*"]` 阻擋，回傳 `ERR_BLOCKED_BY_ADMINISTRATOR`；Playwright browser CDN在此環境亦無法正常解析。因此一鍵發布器會在使用者Windows環境安裝Chromium／WebKit並執行完整E2E，任何失敗都會在Production部署前停止。
