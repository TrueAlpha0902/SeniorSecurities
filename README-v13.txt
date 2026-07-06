SeniorSecurities v13

包含：
1. 我的帳號頁顯示「已綁定裝置」清單。
2. 使用者可自行解除舊裝置或陌生裝置；目前裝置只顯示，不提供解除，避免剛解除又被同一瀏覽器重新綁定。
3. 管理員頁顯示每個使用者的裝置明細。
4. 管理員可清除單一裝置或清除該帳號全部綁定裝置。
5. 忘記密碼遇到 Supabase email rate limit 時，顯示更清楚的說明。

套用：
cd C:\Users\speci\Documents\SeniorSecurities
Expand-Archive -Path "$env:USERPROFILE\Downloads\SeniorSecurities-devices-v13.zip" -DestinationPath "C:\Users\speci\Documents\SeniorSecurities" -Force
npm run build

Supabase SQL Editor 執行：
supabase/devices-self-service-v13.sql

部署：
npx vercel --prod
