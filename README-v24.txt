SeniorSecurities login and daily total v24

包含：
1. 使用者未登入時，首次打開首頁會自動前往會員登入頁。
2. 使用者已登入時，下次打開 App 不會再跳出登入頁。
3. 會員登入頁在密碼下方新增「記住帳號」。
4. 使用者登出後，下次登入會自動帶入已記住的 Email。
5. 首頁「每日練習 X 題」固定顯示今日規劃總題數，不會跟著外面的剩餘題數減少。

套用方式：
cd C:\Users\speci\Documents\SeniorSecurities
Expand-Archive -Path "$env:USERPROFILE\Downloads\SeniorSecurities-login-memory-daily-total-v24.zip" -DestinationPath "C:\Users\speci\Documents\SeniorSecurities" -Force
npm run build
npx vercel --prod
