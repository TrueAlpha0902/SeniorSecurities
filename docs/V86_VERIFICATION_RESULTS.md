# v86 驗證結果

更新日期：2026-07-22

## 已通過

| 檢查 | 結果 |
|---|---|
| Frontend TypeScript `tsc --noEmit` | 通過 |
| TS／TSX 語法轉譯 | 143 檔，0 錯誤 |
| v86 統一體驗契約 | 通過 |
| v83 相容契約 | 通過 |
| v84 手機導覽契約 | 通過 |
| Vercel Function budget | 8／12，保留 4 |
| CSS budget | 10 檔、9,765 行、212 個 `!important` |
| 全形標點 | 40,656 個顯示欄位通過 |
| 相似題 | 19 組人工核對配對、38 題 |
| 證券文字契約 | 通過 |
| 證券結構驗證 | 3,526 題、21,156 個學員文字欄位 |
| 手機布局 | 16／16 通過 |

## 手機布局矩陣

測試 viewport：

- 360 × 800
- 390 × 844
- 412 × 915
- 430 × 932

每一 viewport 驗證：

- 證券首頁沒有橫向溢出
- 初階外匯首頁沒有橫向溢出
- 證券一般練習導覽為 `position: static`
- 外匯一般練習導覽為 `position: static`
- 導覽列位於最後選項／解析之後
- 上一題／下一題不覆蓋內容

原始結果：`docs/v86-mobile-layout-report.json`

## 模擬考專用計時器

靜態契約確認全專案只保留兩個 `<QuizTimer>` render site：

1. 證券 `mode === "random"` 模擬考
2. 外匯 `isMock && !submitted` 模擬考

一般練習沒有計時器 render site；共享計時器也不再使用「練習時間」文案或暫停控制。

## 三考科與五份計畫

證券學員端固定三考科：

```text
投資學
財務分析
證券相關法規與實務
```

考試計畫固定五個 scope：

```text
investment
financial-analysis
securities-laws-practice
fx-remittance
fx-trade
```

`securities-trading-regulations` 與 `securities-trading-practice` 不再成為 learner-facing scope。

## 尚待 Windows 更新器執行

由於本容器 npm 依賴不完整且 registry 無法解析，下列項目必須由更新器在使用者 Windows 專案中執行：

- API TypeScript
- ESLint
- FX 完整資料與契約
- 儲存、可靠性、管理後台與 Recovery 契約
- Production build／PWA
- Public content boundary
- Bundle budget
- Playwright 測試清單／瀏覽器 E2E

更新器採 fail-fast；任一命令退出碼非 0 即停止。
