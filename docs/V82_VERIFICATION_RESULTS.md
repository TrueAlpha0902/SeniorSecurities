# v82 驗證結果

日期：2026-07-20

## 已通過命令

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

## 核心結果

- Vercel公開函數：11／12，保留1支餘裕。
- 初階外匯：3,250題、3,250筆官方計分、3,250則解析、16,250個來源文字欄位、75份來源PDF。
- 特殊計分：3題複數答案、2題凡有作答、1題一律給分；留白計分語義已分開驗證。
- 初階外匯schema：v3。
- 初階外匯內容簽章：`125fe4d18e24e2d037948eaafc4e4895209878c2bef77647e1d82d9e5d108f7c`。
- 證券高業：3,526題、21,156個學員文字欄位、818張來源掃描。
- Production build：1,926 modules transformed。
- PWA precache：96 entries／1,785.85 KiB。
- Initial bundle：171.1 KiB gzip。

完整 `npm run verify` 已執行至ESLint；後續命令以同一工作目錄連續分段執行並全部通過。原因是外層工具對單一長命令有時間限制。
