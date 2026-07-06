SeniorSecurities v26

修正內容：
1. 修正 register_current_device 新增參數造成的「無法確認會員權限」錯誤。
2. 裝置綁定改回穩定的 2 參數 RPC，避免 schema cache 找不到 3 參數函式。
3. 裝置指紋改成瀏覽器可取得的穩定特徵，降低同一台裝置被重複綁定的機率。
4. 今日練習總題數固定顯示今日規劃總題數；下方新題/錯題/複習顯示剩餘數。
5. 每日練習頁新增目前題目的科目與章節標籤。

套用：
cd C:\Users\speci\Documents\SeniorSecurities
Expand-Archive -Path "$env:USERPROFILE\Downloads\SeniorSecurities-daily-total-device-stable-v26.zip" -DestinationPath "C:\Users\speci\Documents\SeniorSecurities" -Force
npm run build
npx vercel --prod

Supabase SQL：
把 supabase\device-stable-v26.sql 整段貼到 Supabase SQL Editor 執行。

注意：
瀏覽器網站無法讀取 MAC Address，這是瀏覽器隱私限制。這版使用穩定瀏覽器/裝置特徵來合併重複裝置。
