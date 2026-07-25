# v85.1 驗證結果

日期：2026-07-22

以下檢查已通過：

```text
Frontend TypeScript
API TypeScript
ESLint
User-scoped storage migration
全域正解模式契約
模擬考延後批改契約
CSS 維護預算
Vercel Function 預算
Production build
公開內容邊界
Bundle 預算
```

## 數值

```text
Vercel Functions：8／12（保留 4 支）
Production modules：1,919
PWA precache：86 entries／約 1,710.62 KiB
Initial assets：約 183.8 KiB gzip
Largest JS：約 225.4 KiB raw
Largest CSS：約 166.6 KiB raw
CSS：10 files／9,592 lines／211 !important
公開來源掃描：0
公開付費章節 shards：0
```

## 已驗證契約

- 正解模式只有一個全域開關。
- 舊分證照與分題庫設定升級後一律關閉。
- 一般練習可使用正解模式。
- 模擬考不受正解模式影響。
- 證券、外匯及相似題的正確選項為全綠。
- 錯誤選項為全紅。
- 不顯示重複的答案摘要卡。
