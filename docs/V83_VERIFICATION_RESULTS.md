# v83 驗證結果（基準版）

> 此文件保留v83基準驗證；目前發布候選為v83.1，請以 `V83_1_VERIFICATION_RESULTS.md` 為準。

更新日期：2026-07-21

## 已通過命令

```text
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
npm run build
npm run test:bundle
```

## 核心數值

```text
Vercel Functions：9 / 12
證券高業：3,526題
初階外匯：3,250題
總題數：6,776題
CSS：9,617行／214個!important
Production modules：1,922
PWA precache：87 entries／約1,804 KiB
Initial assets：約179.3 KiB gzip
Largest JS：約225.4 KiB raw
Largest CSS：約141.9 KiB raw
```

## Production內容檢查

```text
dist/pdf-pages：不存在
dist/data/question-shards：不存在
```

## Playwright

```text
npx playwright test --list
→ 40項測試可被發現
```

一般URL導覽在本容器受到系統Chromium `URLBlocklist: ["*"]` 阻擋，錯誤為 `ERR_BLOCKED_BY_ADMINISTRATOR`。未繞過該政策；應於正常Windows或CI環境執行完整E2E。
