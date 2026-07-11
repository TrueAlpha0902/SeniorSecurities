TrueAlpha 題目裁切與答案修正工具 v59

修正：
- 修復 Node.js 因 package.json type=module，把 .js 視為 ES Module，導致 require is not defined 的問題。
- 本版把本機工具伺服器改成 .cjs，確保使用 CommonJS 執行。
- 已同步更新 QuestionCropEditor.cmd、question-crop-editor.ps1、build-question-crop-editor-exe.ps1。

使用方式：
1. 解壓覆蓋到 SeniorSecurities 專案。
2. 進 desktop 資料夾重新執行 build-question-crop-editor-exe.ps1。
3. 開啟 QuestionCropEditor.exe。
4. 如果 exe 仍有問題，可直接開 QuestionCropEditor.cmd。
