SeniorSecurities v46

Fixes:
1. Calculator now clearly shows three modes: 一般 / 財務 / 解 x.
2. Finance calculator supports PV, FV, and yield rate.
3. Solve x mode supports simple equations such as 2x + 3 = 11 and 100/(1+x)^2 = 90.
4. Presence heartbeat is more frequent and uses a robust Supabase RPC.
5. Leaderboard SQL repairs missing users by backfilling from user_answer_records.

Apply:
cd C:\Users\speci\Documents\SeniorSecurities
Expand-Archive -Path "$env:USERPROFILE\Downloads\SeniorSecurities-calculator-presence-leaderboard-v46.zip" -DestinationPath "C:\Users\speci\Documents\SeniorSecurities" -Force
npm run build

Then run this SQL in Supabase:
supabase/leaderboard-presence-repair-v46.sql

Deploy:
npx vercel --prod
