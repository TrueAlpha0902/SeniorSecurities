TrueAlpha Question Editor v60 image path fix

用途：
修正 QuestionCropEditor 無法載入 public/pdf-pages 圖片的問題。
錯誤範例：
圖片載入失敗：pdf-pages/investment/ch01/page-01.webp

使用方式：
1. 解壓縮本包到 SeniorSecurities 專案根目錄。
2. 執行：
   powershell -ExecutionPolicy Bypass -File .\fix-question-editor-imagepath-v60.ps1
3. 重新產生 EXE：
   cd C:\Users\speci\Documents\SeniorSecurities\desktop
   powershell -ExecutionPolicy Bypass -File .\build-question-crop-editor-exe.ps1
