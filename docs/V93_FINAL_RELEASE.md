# SeniorSecurities v93：深色互動與原生素材重製

## 目標

v93 將學習者與管理介面的預設視覺統一為護眼深色系統，移除看似可操作但沒有功能的控制項，並為導覽、提交、儲存、載入、錯誤及危險操作提供即時且可存取的回饋。

## 互動邊界

- 全部原生按鈕、`GlassButton` 與路由按鈕由靜態契約掃描。
- 沒有 handler、表單 action 或 route destination 的控制項會阻止 `npm run verify`。
- Hash 導覽會捲動、聚焦並公告目的區段。
- 搜尋結果會開啟指定題號，而非只進入章節首頁。
- 設定與計算機首次載入時顯示明確 loading overlay。
- 成功、資訊、警告與錯誤操作使用統一 live-region 回饋。
- 原生 `alert`、`confirm`、`prompt` 已從來源碼移除；危險操作改用焦點鎖定的自訂確認對話框。
- 模擬考交卷、離開、答案儲存與管理員操作均具有 busy、成功與失敗狀態。

## 視覺系統

- 預設背景：`#07090c`
- 主要表面：`#10151c`
- 提升表面：`#161c25`
- 主要文字：`#f4f7fa`
- 次要文字：`#9da8b4`
- 互動重點：`#7bc8d5`
- 正確狀態：`#92d3a8`
- 錯誤狀態：`#ee9797`

所有可見介面改用原生文字與 inline SVG。歷史手寫 PNG 保留於資料邊界供相容與回復使用，但可見 TSX 不再引用帶文字圖片，因此不會再出現圖片文字與普通文字重複。


## 最終深色覆蓋

最終整合額外將計算機、管理後台、會員中心、搜尋、設定確認視窗、歷屆表格與每日計畫等歷史白色表面納入同一深色表面規則。下拉選單、瀏覽器自動填入、文字選取與對話框遮罩亦使用護眼深色樣式。

瀏覽器初始載入、PWA manifest、安裝後啟動畫面及 iOS 狀態列也統一為 `#07090c`，避免 React 掛載前或 PWA 啟動時閃出白色背景。

舊版 v83、v84、v85 與外匯契約中只綁定 `HandwrittenIcon`／`answer-result-label` 實作名稱的檢查，已改為驗證目前的 `V93BrandLockup`／`V93AnswerBadge` 原生文字與向量實作；可存取首頁入口、選項層級正誤回饋與無重複答案摘要等產品行為並未放寬。

## 無障礙與回饋

- 所有掃描到的按鈕、表單欄位與對話框均具有可存取名稱。
- 對話框具有 `aria-modal`、焦點管理及 Escape 行為。
- `focus-visible`、hover、active、disabled 與 busy 狀態一致。
- 支援 `prefers-reduced-motion`。
- 桌面與手機的 focused Playwright suite 包含主要路由、導覽、設定、計算機、搜尋指定題號、模擬考與未知路由復原。

## 驗證命令

```bash
npm run verify
npm run test:e2e:v93
```

`npm run verify` 執行全部既有資料、型別、Lint、CSS、題庫、安全及 v93 契約；`npm run test:e2e:v93` 在 desktop 與 mobile Chromium 執行聚焦瀏覽器測試。

## 發布邊界

v93 更新包只修改前端、測試與文件。它不會：

- 部署 Vercel
- 修改 Supabase
- 讀取或覆寫 `.env.local`
- 推送 GitHub
- 變更題庫答案、解析或權限資料
