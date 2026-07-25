# SeniorSecurities v83 發布前審查

> 此文件為v83基準審查；目前發布候選為v83.1，請優先參考 `RELEASE_REVIEW_v83_1.md`。


更新日期：2026-07-21
版本定位：**產品與技術收斂版**
正式站狀態：**尚未部署**

## 1. 版本目標

v83 不增加第三張證照，而是收斂既有證券高業與初階外匯的產品架構。主要目標如下：

1. 付費題庫內容不再依賴公開靜態檔案。
2. 模擬考在交卷前由伺服器真正延後提供答案與解析。
3. 證券高業與初階外匯共用一致的題目、解析與導覽層級。
4. 學員 Production 移除不再使用的證券掃描頁及公開題庫 shards。
5. Vercel 公開 Functions 保留足夠部署餘量。
6. 收斂首頁、章節頁、搜尋、設定與會員中心的資訊架構。

## 2. 題庫範圍

| 題庫 | 範圍 | 題數 |
|---|---|---:|
| 證券高業 | 3考科／4題庫、40章 | 3,526 |
| 初階外匯 | 第23至47屆、2科 | 3,250 |
| **合計** | 2張證照 | **6,776** |

題目、答案與解析內容未因本次介面與架構重構而改寫。

## 3. 付費內容 API 收斂

新增統一受保護入口：

```text
/api/questions
```

同一支 API 負責：

- 證券高業章節題庫
- 初階外匯歷屆題庫
- 跨證照搜尋
- 證券題目覆寫投影
- 證券及外匯模擬考開始、續考與交卷

所有付費題庫請求都必須先驗證登入，再依 `exam_id` 驗證：

```text
senior-securities
junior-foreign-exchange
```

舊 API 路徑以 `vercel.json` rewrite 維持相容，但不再增加新的 Serverless Function。

## 4. 模擬考答案延後揭露

v83 將證券高業與初階外匯的模擬考改為伺服器控制：

```text
開始／續考
→ 回傳題目、選項、題序及簽章 token
→ 不回傳答案、特殊計分規則及解析

交卷
→ 驗證登入、題庫權限、使用者、題庫版本及 token 簽章
→ 後端評分
→ 才回傳正解、成績與解析
```

簽章 token 具備：

- 使用者綁定
- 題庫版本綁定
- 題目順序綁定
- 四小時有效期限
- HMAC-SHA256 簽章
- 內容版本變更時拒絕舊 session

此設計可避免只靠前端隱藏答案所造成的 Network／記憶體洩漏。

## 5. Production 公開資產收斂

Production build 已確認以下路徑不存在：

```text
dist/pdf-pages
dist/data/question-shards
```

因此學員版不再公開：

- 818張證券來源掃描頁
- 證券完整章節題庫 JSON
- 公開靜態答案與解析 shards

掃描頁仍保留於開發／稽核來源專案，並由 `.vercelignore` 排除。文字離線包改為登入後按章節取得，不再下載掃描圖片。

## 6. Vercel Function 預算

公開 API entrypoints 已由 v82 的11支降至：

```text
9 / 12
```

保留3支額度。已合併或移除：

```text
api/foreign-exchange/questions.ts
api/question-overrides.ts
api/admin/audit-events.ts
```

`npm run check:vercel-functions` 在 prebuild 與完整驗證前執行，超過專案上限9支即停止。

## 7. 產品資訊架構

### 7.1 全域導覽

頁首依目前路由顯示證照、科目、章節或功能上下文，並提供：

- 返回
- 全站搜尋
- 切換證照
- 計算機
- 設定
- 帳號

手機版自動縮減次要操作。

### 7.2 證照入口

入口頁新增：

- 繼續上次練習
- 分題庫權限狀態
- 最近學習位置
- 每套題庫進度
- 正確的「3考科／4題庫」文案

### 7.3 證券高業

首頁改為：

```text
繼續上次練習
今日任務
2×2科目進度
弱點與複習
更多工具
```

章節頁桌面改用高密度清單，手機維持單欄卡片。

### 7.4 初階外匯

第23至47屆可依下列範圍篩選：

```text
現行新制
近5屆
全部歷屆
```

並可依國外匯兌／進出口外匯篩選。第47屆 ISO 20022 優先呈現。

### 7.5 搜尋

`/search` 已正式啟用。搜尋在伺服器執行，只查詢使用者已開通的題庫；結果不回傳答案及完整解析，也不要求瀏覽器先下載6,776題。

### 7.6 設定與會員中心

設定分為：

```text
一般
證券高業
初階外匯
資料管理
```

會員中心分為：

```text
我的題庫
學習資料
帳號與安全
```

前端不再以 `VITE_ADMIN_EMAILS` 判斷管理員。

## 8. 舊流程移除

以下重複學員流程已移除：

```text
src/pages/QuestionsPage.tsx
src/pages/QuizPage.tsx
src/pages/ResultPage.tsx
src/pages/ReviewPage.tsx
src/lib/data.ts
```

舊 `/questions/*`、`/quiz/*`、`/result`、`/review` 路徑改為安全重新導向。

## 9. 驗證結果

| 項目 | 結果 |
|---|---|
| Vercel Functions | 9／12，通過 |
| 初階外匯來源與計分 | 3,250題，通過 |
| 證券文字題庫 | 3,526題，通過 |
| 證券最終異常稽核 | 0項異常 |
| 題庫 shards／每日計畫索引 | 通過 |
| 模擬考契約 | 通過 |
| v83產品契約 | 通過 |
| TypeScript | 通過 |
| API TypeScript | 通過 |
| ESLint | 通過 |
| CSS budget | 9,617行、214個 `!important`，通過 |
| Production build | 1,922 modules，通過 |
| PWA | 91 entries／約1,823 KiB |
| 初始資源 | 約179.3 KiB gzip |
| 最大JS | 約225.4 KiB raw |
| 最大CSS | 約141.9 KiB raw |
| Bundle budget | 通過 |
| 公開掃描／題庫 shards | Production輸出不存在 |

完整 `npm run verify` 在此工作環境執行到 ESLint 前後受到長時間命令限制；所有組成命令均已個別執行並通過。

## 10. E2E 狀態

`npx playwright test --list` 已列出40項測試，涵蓋桌面、手機、平板與mock流程。

此容器沒有已下載的Playwright瀏覽器；改用系統Chromium時，系統管理政策套用：

```text
URLBlocklist: ["*"]
ERR_BLOCKED_BY_ADMINISTRATOR
```

因此未繞過系統政策執行URL導覽式E2E。預覽截圖使用實際React元件、正式CSS及正式資料，以離線掛載方式渲染，不是另外繪製的設計稿。正式發布前仍應在未受該政策限制的Windows或CI環境執行：

```powershell
npm ci
npm run verify
npx playwright install chromium
npm run test:e2e
```

## 11. 已知限制

- 模擬考簽章 token 目前以本機 session 保存，尚未提供跨裝置續考。
- 管理員來源掃描與裁切工具仍屬開發／管理來源專案，不在學員 Production。
- `ImageQuizPage`、`db.ts`及管理後台仍屬大型模組，後續可繼續拆分。
- 歷史CSS技術債仍存在；v83維持既有視覺相容，尚未將 `!important` 降至零。

## 12. 發布狀態

v83 已完成程式、資料契約、production build、預覽與封裝前驗證，**尚未推送GitHub、尚未部署Vercel、尚未修改正式站**。
