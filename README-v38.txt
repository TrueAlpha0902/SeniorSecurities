SeniorSecurities leaderboard admin v38

修改內容：
1. 首頁「連續答對排行榜」更名為「排行榜」。
2. 管理後台新增「排行榜管理」按鈕。
3. 點「排行榜管理」後會開啟排行榜資料視窗。
4. 後台可看到排行榜名稱對應的 Email。
5. 可在排行榜管理視窗中刪除指定使用者的排行榜紀錄。
6. 使用者列表右側移除原本每個帳號的「刪排行榜」按鈕，避免看不出排行榜名稱對應誰。

套用方式：
cd C:\Users\speci\Documents\SeniorSecurities
Expand-Archive -Path "$env:USERPROFILE\Downloads\SeniorSecurities-leaderboard-admin-panel-v38.zip" -DestinationPath "C:\Users\speci\Documents\SeniorSecurities" -Force
npm run build
npx vercel --prod

本版不用跑 Supabase SQL。
