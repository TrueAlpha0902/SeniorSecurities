管理工具整合說明

ActivationCodeGenerator.exe、AdminAccountManager.exe、QuestionCropEditor.exe 的主要功能
已整合到正式站管理員後台：

https://senior-securities.vercel.app/admin

線上版本的優點：
- 不需要在管理員電腦保存 Supabase service-role key。
- 所有 admin_users 中啟用的管理員皆可使用。
- 啟用碼、管理員帳號與題目裁切集中在同一個介面。
- 題目修改保存於私有 Supabase Storage，App 會自動套用。

原 EXE 暫時保留作為離線備援，但已排除於 Vercel 部署內容之外。
