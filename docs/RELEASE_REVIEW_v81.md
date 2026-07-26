# SeniorSecurities v81 發布前審查

更新日期：2026-07-20  
發布標的：證券高業 3,526 題掃描全文字化  
狀態：完成發布前驗證，尚未部署正式網站

## 交付範圍

- 證券高業 4 科、40 章、3,526 題。
- 每題皆有題幹、四個文字選項、既有正確答案及文字解析。
- 文字唯一來源為專案內 818 張掃描頁。
- 每題保留可展開的原始題圖及原始解析圖。
- 一般練習、正解練習、模擬測驗、相似題目與搜尋均支援文字。
- 模擬測驗交卷前不顯示正解、正誤樣式或解析。
- 表格以可捲動 HTML 表格呈現。

## 最終資料指標

| 項目 | 結果 |
|---|---:|
| 題目 | 3,526 |
| 學員可見文字欄位 | 21,156 |
| 多引擎一致題目 | 3,114 |
| 掃描人工覆寫題目 | 412 |
| 高風險逐題掃描覆寫 | 187 |
| 跨40章視覺抽查 | 152 |
| Markdown 表格題 | 14 |
| 最終異常 | 0 |
| 掃描頁 | 818 |

最終文字資料：

```text
build-data/securities-text-final.json
SHA-256: c62c12ccecb071fb2bc870f4b8b097f96b1718268bfe9cdcd5de11acb0e8e7b7
```

題庫 release：

```text
c2c5cc72ed708012
```

## 驗證結果

發布前最後一輪已通過：

```text
npm run validate:securities-text
npm run audit:securities-text-final
npm run test:securities-text-contracts
npm run test:shards
npm run test:plan-index
npm run test:mock-exam
npm run typecheck
npm run typecheck:api
npm run lint
npm run build
npm run test:bundle
```

先前完整組成驗證亦已涵蓋初階外匯、原圖片題資料、手機分段、CSS、計算機、學習引擎、使用者隔離、可靠性儲存、管理後台、裁切編輯器、每日計畫及 App 復原。整合命令 `npm run verify` 在最後 build 階段受到執行環境長時間命令限制；同一 build 與 bundle 檢查獨立重跑並通過。

Production build：

```text
1,926 modules transformed
PWA precache: 96 entries / 1,785.56 KiB
Initial assets: 171.1 KiB gzip
Largest JS: 225.4 KiB raw
Largest CSS: 108.2 KiB raw
```

## 實際頁面證據

預覽位於 `docs/release-preview-v81/`：

1. `01-securities-home-desktop.png`：證券高業文字題庫入口。
2. `02-securities-question-desktop.png`：純文字題幹及四選項。
3. `03-securities-answer-explanation-desktop.png`：錯誤答案、正解與文字解析。
4. `04-securities-table-desktop.png`：表格題 HTML 呈現。
5. `05-securities-mock-before-submit-desktop.png`：交卷前只顯示已選擇，不洩漏正解。
6. `06-securities-question-mobile.png`：手機版文字題目。

上述畫面以實際 React 元件、production CSS 與正式題庫資料離線掛載後擷取，不是另外繪製的靜態設計稿。

## E2E 環境限制

此容器的系統 Chromium 套用 `URLBlocklist: ["*"]`，因此未執行一般 URL 導覽式 Playwright E2E，也未嘗試繞過管理政策。正式發布前應在未套用該政策的 Windows 或 CI 環境執行：

```powershell
npm ci
npm run test:e2e
```

## 正確性界線

全部 3,526 題均已文字化，且通過來源雜湊、欄位完整性、答案一致性、格式、已知 OCR 汙染、英文黏字、頁碼殘留與指定高風險覆寫檢查。這仍不等同於兩位人工校對員對 21,156 個欄位完成獨立雙錄；每題原掃描入口因此保留作為最終核對依據。

## 部署狀態

v81 尚未推送或部署至正式網站。本審查包可先在本機執行完整測試及畫面驗收，再決定是否發布。
