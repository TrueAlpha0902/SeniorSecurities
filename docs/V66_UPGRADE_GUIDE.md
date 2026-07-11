# SeniorSecurities v66 升級與驗收指南

## 套用方式

1. 將 v66 patch ZIP 解壓到 `C:\Users\speci\Documents\SeniorSecurities`，選擇覆蓋同名檔案。
2. 在專案根目錄以 PowerShell 執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\APPLY_V66_UPGRADE.ps1
```

3. 指令詢問是否套用 Supabase migration 時，確認目前連結的是正式 `SeniorSecurities` project，再輸入 `Y`。
4. 指令完成後會 commit 並 push；既有 Vercel Git integration 會接續建置。

## 功能範圍

### 計算機

介面集中於同一個可拖曳視窗，主要模式包括：

- 一般與科學運算、DEG／RAD、SHIFT、Ans、記憶、歷史與分數／小數切換
- 一元與二元聯立方程式
- 複數、BIN／OCT／DEC／HEX
- 最高 3×3 矩陣與三維向量
- 統計、常態與二項分布、函數表
- 比例與一／二次不等式
- 債券近似殖利率、CAPM、WACC

這是針對網站學習情境實作的 ClassWiz 風格功能介面，不是 Casio 韌體模擬器，也不宣稱按鍵序列與實體機逐鍵完全相同。

### 學習系統

- 每次作答寫入唯一 event id；重送不重複計分。
- 本機與雲端保存題目學習狀態，依信心與正誤更新 FSRS 排程。
- 錯題會在同一 session 再次出現；使用者可標記「確定／不確定／猜的／不知道」。
- 首頁顯示新題、學習中、待複習與已掌握數量。

### 模擬考測驗

- 單科模式可選 25、50、80、100 或 1–300 題。
- 完整模考固定 150 題、210 分鐘，投資學 50、財務分析 50、法規與實務合計 50。
- 答題期間不揭示答案，提供答題卡、待檢標記、倒數、交卷確認與自動交卷。

### 管理與安全

- 主要管理員可刪除啟用碼；操作會寫入 audit event。
- 管理權限以 `user_id` assignment 為主，支援四種角色。
- 可對個別管理員強制 MFA；帳號頁可完成 TOTP 綁定與 AAL2 驗證。
- 題庫發布需建立者以外的管理員核准，只有主要管理員能發布或回滾。

## Smoke test

1. 一般帳號登入、同步與題庫讀取。
2. 計算機測試：`sin(30)`、矩陣反矩陣、複數乘法、統計、二項分布與二元聯立。
3. 建立單科 25 題測驗，確認答題卡與待檢標記。
4. 建立完整模考，確認顯示 150 題與 210 分鐘且作答前不揭示答案。
5. 相似題先作答再揭示，確認錯因、筆記與重做錯題。
6. 主要管理員刪除一組測試啟用碼。
7. 建立題庫 release，使用另一管理員核准，再由主要管理員發布與回滾。
8. 帳號頁設定 TOTP，重新驗證後確認管理 API 接受 AAL2 session。
9. 查看 Vercel runtime log，確認沒有新增 4xx／5xx。
