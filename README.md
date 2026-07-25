# SeniorSecurities

證券高業題庫 PWA，包含章節練習、每日計畫、錯題／收藏、FSRS 間隔複習、模擬考、排行榜、計算機、離線科目包與題庫發布治理。

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

## 重要文件

- `docs/CURRENT_STATE.md`：目前正式狀態
- `docs/STABILIZATION_FINAL_REPORT.md`：穩定化成果與驗收
- `docs/OPTIMIZATION_ROADMAP.md`：後續維護路線
- `AGENTS.md`：Codex／AI 修改規則

## 資料庫

部署 Stabilization Final 前，必須套用：

```text
supabase/migrations/20260712090000_stabilization_final.sql
```
