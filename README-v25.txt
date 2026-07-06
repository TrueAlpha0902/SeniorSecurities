SeniorSecurities v25

修正內容：
1. 首頁每日練習標題顯示「今日規劃總題數」，不再被今日已完成題數扣掉。
2. 首頁新題 / 錯題 / 複習區塊顯示「剩餘題數」，作答後會往下扣。
3. 每日練習頁上方標記目前題目來源：科目 / 章節。
4. 每日練習頁的今日規劃、已完成、剩餘會把今天已經做過的題數一起算入。
5. 裝置綁定改用瀏覽器可取得的穩定裝置特徵輔助合併重複裝置。瀏覽器無法取得 MAC ID，所以不能用 MAC 綁定。
6. Supabase SQL：supabase/device-fingerprint-v25.sql。請在 Supabase SQL Editor 執行一次。

套用方式：
cd C:\Users\speci\Documents\SeniorSecurities
Expand-Archive -Path "$env:USERPROFILE\Downloads\SeniorSecurities-daily-device-fix-v25.zip" -DestinationPath "C:\Users\speci\Documents\SeniorSecurities" -Force
npm run build
npx vercel --prod

然後到 Supabase SQL Editor 執行：
supabase/device-fingerprint-v25.sql
