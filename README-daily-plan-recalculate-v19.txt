SeniorSecurities daily plan recalculate v19

修正：首頁「今日剩餘題數」會沿用舊的本日每日練習計畫，導致調整考試日期、每天讀書時間或備考強度後沒有重新計算。

變更：
- 每日練習計畫會記錄目前考試計畫簽章。
- 考試日期 / 每天讀書時間 / 備考強度改變後，舊的每日練習計畫會自動失效。
- 儲存新的考試計畫時，會清除本機舊 daily-plan 快取。
- 舊版本沒有簽章的 daily-plan 會被視為過期，套用補丁後會立即重新計算。

套用後執行：
npm run build
npx vercel --prod
