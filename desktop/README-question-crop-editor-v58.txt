TrueAlpha 題目裁切與答案修正工具 v58

修正：
- 修復 EXE 模式下 $MyInvocation.MyCommand.Path 為 Null 造成工具無法開啟的問題。
- 工具會自動從 EXE 所在資料夾尋找 question-crop-editor-server.js。
- 若 EXE 仍無法啟動，可使用 QuestionCropEditor.cmd。

請重新執行 build-question-crop-editor-exe.ps1 產生新的 QuestionCropEditor.exe。
