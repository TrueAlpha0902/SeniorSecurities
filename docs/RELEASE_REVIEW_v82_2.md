# SeniorSecurities v82.2 發布前審查

## 範圍

v82.2只調整證券高業學員端的題目與解析呈現，並完全移除原始掃描檢視功能。題庫文字、答案、解析、作答紀錄、會員權限、Supabase、初階外匯與Vercel API均不變。

## 介面變更

- 移除右上「原圖」按鈕、題目／解析行內原圖入口及原圖對話框。
- 題目卡採純白底、細灰框及低陰影；取消主色左標線、彩色漸層與彩色膠囊標籤。
- 題目標籤改為中性灰文字與細分隔線，題幹維持較大字級與足夠行距。
- 解析卡同步採純白底、細灰框與中性標題分隔線。
- 切題後回到題目起始位置的導引保留。
- 若題文或解析資料異常，顯示中性文字提示，不向學員顯示掃描圖。

## 安全與資料界線

- 證券高業3,526題的題文、14,104個選項、3,526筆答案與3,526則解析未被修改。
- 初階外匯第23至47屆3,250題未被修改。
- Serverless Functions維持11／12。
- 無Supabase migration。
- 來源掃描仍保留於專案內部稽核與建置來源，但不再由學員介面提供檢視。

## 驗證

以下命令已逐項通過：

```text
npm run test:securities-text-contracts
npm run typecheck
npm run typecheck:api
npm run lint
npm run test:css
npm run check:vercel-functions
npm run build
npm run test:bundle
```


實際驗證結果：

```text
證券文字介面契約：通過
Frontend TypeScript：通過
API TypeScript：通過
ESLint：通過
CSS維護預算：10個CSS檔、9,798行、215個!important，通過
Vercel Function預算：11／12，通過
Production build：1,926 modules transformed，通過
PWA precache：95 entries / 1,784.36 KiB
Initial assets：171.3 KiB gzip
Largest JS：225.4 KiB raw
Largest CSS：109.8 KiB raw
Bundle budget：通過
```

契約測試會阻止下列內容重新出現：

- `quiz-source-button`
- `OriginalScanDialog`
- `OriginalScanDetails`
- 「查看原始題圖」或「查看原始解析圖」
- 題目主色左標線
- 題目或解析非白底的強烈色塊

## 預覽證據

- `docs/review-evidence/v82.2/question-white-desktop.png`
- `docs/review-evidence/v82.2/answer-explanation-white-desktop.png`
- `docs/review-evidence/v82.2/answer-explanation-white-mobile.png`

預覽由實際 `ScanQuestionContent`、`ScanOptionText`、`ScanExplanationContent`、production CSS及正式題庫記錄離線渲染；未另行繪製設計稿。

## 發布狀態

本審查包不自動修改Supabase；更新工具只套用前端、測試與文件，完成本機驗證後由使用者決定是否部署。
