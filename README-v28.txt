SeniorSecurities v28

修正內容：
1. 首頁「每日練習 X 題」不再把錯題訂正數量加回總題數；它只顯示今日新題練習規劃總量。
2. 下方「錯題訂正」只顯示目前待訂正錯題數量，作為獨立指標，不回填到每日練習總題數。
3. 每日練習頁的「今日規劃 / 已完成 / 剩餘」改以今日新題練習計畫為主。
4. 今日練習本機暫存版本升級為 v28，會讓舊的 v27 暫存失效並重新產生計畫。
5. 題目圖片裁切框下緣增加安全延伸，避免長題底部被截掉。

套用方式：
cd C:\Users\speci\Documents\SeniorSecurities
Expand-Archive -Path "$env:USERPROFILE\Downloads\SeniorSecurities-daily-count-image-fix-v28.zip" -DestinationPath "C:\Users\speci\Documents\SeniorSecurities" -Force
npm run build
npx vercel --prod
