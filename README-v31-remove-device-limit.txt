# v31 裝置限制移除

本版改動：

1. 移除登入裝置數限制。
2. 完整題庫權限只看帳號是否已用啟用碼開通。
3. 管理後台右側操作按鈕恢復為「取消/恢復權限」與「重設密碼信」。
4. 移除「清除綁定裝置」與單一裝置清除按鈕。
5. 我的帳號頁移除裝置限制與綁定裝置管理區塊。
6. 管理後台仍可保留裝置紀錄欄位，作為登入環境參考，但不再限制使用。

套用：

```powershell
cd C:\Users\speci\Documents\SeniorSecurities
Expand-Archive -Path "$env:USERPROFILE\Downloads\SeniorSecurities-remove-device-limit-v31.zip" -DestinationPath "C:\Users\speci\Documents\SeniorSecurities" -Force
npm run build
npx vercel --prod
```

Supabase SQL：

到 Supabase SQL Editor 執行：

```txt
supabase/device-limit-removed-v31.sql
```
