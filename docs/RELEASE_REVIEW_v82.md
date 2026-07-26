# SeniorSecurities v82 發布前審查

更新日期：2026-07-20

## 發布內容

v82 同時完成：

1. 修正v81在Vercel Hobby部署時超過12個Serverless Functions的阻斷問題。
2. 將初階外匯由第45至47屆390題擴充為第23至47屆3,250題。
3. 修正官方特殊計分中「凡有作答」與「一律給分」的語義差異。

## 初階外匯完整封存

- 屆次：第23至47屆，共25屆。
- 國外匯兌業務：1,250題。
- 進出口外匯業務：2,000題。
- 總題數：3,250題。
- 來源PDF：75份，包含50份試題及25份答案表；專案內採跨平台ASCII標準檔名，原檔名與SHA-256保留於來源對照表。
- 題幹與四個選項：16,250個文字欄位，全部由來源PDF內嵌文字層取得。
- 官方計分紀錄：3,250筆。
- 解析：3,250則；第45至47屆為逐題詳細解析，第23至44屆為官方答案對照式保守解析。
- OCR：未使用。第36屆進出口外匯的選項編號字型缺少Unicode映射，只用PDF座標與印刷標記像素分段，題文仍取自原生文字層。
- schema：v3。
- 內容簽章：`125fe4d18e24e2d037948eaafc4e4895209878c2bef77647e1d82d9e5d108f7c`。

## 特殊計分

6題特殊計分已分成三類：

| 類型 | 題目數 | 留白是否得分 |
|---|---:|---|
| 複數答案可計分 | 3 | 否 |
| 凡有作答給分 | 2 | 否；必須選擇A至D之一 |
| 一律給分 | 1 | 是；交卷後自動計分 |

「凡有作答」使用 `allAnsweredCredit`；「一律給分」使用 `automaticCredit`。模擬考交卷前不將自動給分計入學員可見統計，避免提前洩漏答案表資訊。

## Vercel Hobby修正

v81共有13個公開API entrypoints，因此部署時被Hobby方案的12個Functions上限拒絕。v82採以下合併：

- `/api/auth/log-login` 併入 `/api/client-error?event=login-audit`。
- `/api/admin/ping` 併入 `/api/admin/action?operation=health`。
- `vercel.json` 保留兩條相容rewrite，既有前端呼叫路徑不用改。
- 刪除兩個獨立entrypoint後，公開Vercel Functions由13個降為11個，保留1個安全餘量。
- `npm run check:vercel-functions` 已加入 `prebuild` 與 `verify`；若未來再次超過11個，會在雲端部署前先失敗。

## 權限與資料傳送

- 初階外匯仍使用 `junior-foreign-exchange` 獨立entitlement。
- 題目API需登入並驗證 `user_exam_entitlements`。
- 學員payload不包含來源PDF、頁碼、SHA-256、內部審核狀態或解析來源分類。
- 來源PDF放在 `source-materials/foreign-exchange-official-pdfs`，由 `.vercelignore` 排除，不會進入Production部署。

## 驗證結果

以下檢查已通過：

```text
npm run check:vercel-functions
npm run audit:fx-source
npm run validate:fx
npm run test:fx-contracts
npm run validate:securities-text
npm run audit:securities-text-final
npm run test:securities-text-contracts
npm run validate:image-data
npm run test:shards
npm run test:plan-index
npm run test:mobile-segments
npm run test:mock-exam
npm run typecheck
npm run typecheck:api
npm run lint
npm run test:css
npm run test:calculator
npm run test:learning
npm run test:storage
npm run test:reliability
npm run test:integrity
npm run test:admin
npm run test:crop-editor
npm run test:daily-plan
npm run test:recovery
npm run validate:data
npm run build
npm run test:bundle
```

Production build：

```text
1,926 modules transformed
PWA precache：96 entries / 1,785.85 KiB
Initial assets：171.1 KiB gzip
Largest JS：225.4 KiB raw
Largest CSS：108.2 KiB raw
Vercel public functions：11 / 12
```

完整 `npm run verify` 已通過至ESLint；剩餘命令另以同一工作目錄連續執行並全部通過。拆分執行是為避免單一外層工具的時間限制，不代表測試失敗。

## 正確性界線

16,250個題幹／選項欄位與3,250筆答案已完成三條PDF文字擷取路徑的一致性核對，但沒有兩位人工校對員逐字雙錄證明。第23至44屆解析只做官方答案對照，不宣稱為官方詳解或現行法規意見。

## 發布狀態

v82目前為發布前審查版，尚未部署至正式網站。正式部署不需要新的Supabase migration，但既有 `20260719120000_exam_scoped_entitlements_v80` 必須已套用。
