SeniorSecurities mobile usability v17

包含：
1. 修正手機「調整考試計畫」彈窗無法往下滑到儲存按鈕的問題。
2. 讓設定彈窗本身可滾動，底部操作按鈕會黏在底部，方便手機操作。
3. 手機閱讀 PDF 圖片題時，自動使用較大的橫向可滑動圖片寬度，讓字變大、可左右滑查看。

套用：
cd C:\Users\speci\Documents\SeniorSecurities
Expand-Archive -Path "$env:USERPROFILE\Downloads\SeniorSecurities-mobile-usability-v17.zip" -DestinationPath "C:\Users\speci\Documents\SeniorSecurities" -Force
npm run build
npx vercel --prod

注意：
圖片題本質仍然是 PDF 截圖，無法像 HTML 文字一樣無損改字體大小。這版先用「手機自動放大 + 橫向滑動」改善可讀性。若要真正最佳可讀性，下一階段需要把題目 OCR/校對成文字資料，再用 HTML 顯示題目。
