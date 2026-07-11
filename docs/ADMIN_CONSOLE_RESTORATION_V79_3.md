# v79.3 管理後台還原說明

## 問題原因

v79 安全強化移除了帳號頁內硬編碼的管理員 Email，但前端入口仍只依賴 `VITE_ADMIN_EMAILS`。正式環境若沒有設定該前端變數，「管理後台」按鈕就會消失；此外，伺服器只把環境變數中的 Email 視為主要管理員，沒有把資料庫 `primary_admin` 角色完整反映到前端。

## 修正

- 帳號頁改為呼叫 `/api/admin/tools?tool=access`，由伺服器端角色判定入口。
- 保留 `/admin` route、使用者管理、裝置管理、授權、排行榜、稽核、啟用碼、題庫編輯、發布與系統健康檢查。
- 既有 `admin_users` 中的主要管理員會由 migration 提升／同步到 `admin_role_assignments`。
- 不在前端或後端硬編碼管理員 Email。
- 一般管理員可查看／建立啟用碼；刪除啟用碼與管理員異動仍要求 `primary_admin + AAL2`。
- 資料庫 `primary_admin` 會正確回傳 `isPrimaryAdmin=true`。

## Vercel 建議環境變數

建議設定伺服器端（不要加 `VITE_`）：

```text
PRIMARY_ADMIN_EMAILS=你的主要管理員Email
ADMIN_REQUIRE_MFA=false
```

`ADMIN_REQUIRE_MFA=false` 只允許 AAL1 進入檢視頁；所有破壞性操作仍由各 API 明確要求 AAL2。
