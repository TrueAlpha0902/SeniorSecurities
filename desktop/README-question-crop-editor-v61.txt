TrueAlpha 題目截圖與答案修正工具 v61

修正：
1. 修復 v60 fix-question-editor-imagepath-v60.ps1 的 PowerShell 語法錯誤。
2. 修復圖片路徑，工具會正確讀取 public/pdf-pages/...。
3. 介面改成簡化版：選題、預覽、按鈕微調、儲存。
4. 保留答案修正功能，可直接把正確答案改成 1/2/3/4。
5. 儲存時自動備份 public/data/pdf-image-quiz.json。

使用方式：
1. 解壓覆蓋到 SeniorSecurities。
2. 到 desktop 執行 build-question-crop-editor-exe.ps1。
3. 開啟 QuestionCropEditor.exe。
4. 若 EXE 有問題，可直接開 QuestionCropEditor.cmd。
