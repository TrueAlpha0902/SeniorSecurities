TrueAlpha 題目裁切與答案修正工具 v56

功能：
1. 選擇科目、章節、題號。
2. 調整題目截圖 x/y/寬/高，並即時預覽裁切結果。
3. 調整解析截圖 x/y/寬/高，並即時預覽裁切結果。
4. 修改正確答案 1/2/3/4。
5. 儲存時會修改 public/data/pdf-image-quiz.json，並自動建立備份：
   public/data/backups/pdf-image-quiz-before-edit-YYYYMMDDHHMMSS.json

注意：
- 這是本機工具，不會自動部署網站。
- 儲存後請回專案根目錄執行 npm run build 與 npx vercel --prod。
- 如果 EXE 產生失敗，可直接使用 QuestionCropEditor.cmd。
