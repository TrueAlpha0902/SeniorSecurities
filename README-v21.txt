SeniorSecurities v21

修正每日練習頁面的即時剩餘題數：
- 使用者每提交一題答案後，「今日剩餘 X 題」會立即減少，不需要回首頁再重新進入。
- 「錯題訂正 X 題」也會依照目前作答狀態即時扣減。
- 保留 v20 的功能：今日計畫依考試日期、每日讀書時間、備考強度重算；模擬考預設 50 題且可自訂題數；手機考試計畫可滑到底。

套用方式：
Expand-Archive -Path "$env:USERPROFILE\Downloads\SeniorSecurities-daily-live-count-v21.zip" -DestinationPath "C:\Users\speci\Documents\SeniorSecurities" -Force
npm run build
npx vercel --prod
