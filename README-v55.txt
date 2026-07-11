SeniorSecurities v55 - 管理員帳號管理器

功能：
1. 新增 / 恢復管理員
2. 停用管理員
3. 刪除管理員紀錄
4. 查看目前管理員名單

使用前必做：
1. 到 Supabase SQL Editor 執行：supabase/admin-users-v55.sql
2. 套用本補丁後執行 npm run build
3. 部署 npx vercel --prod
4. 到 desktop 執行 build-admin-manager-exe.ps1 產生 AdminAccountManager.exe

注意：
- AdminAccountManager.exe 會讀取 .env.local 的 VITE_SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。
- 不要把 .env.local 或 exe 傳給別人。
- ADMIN_EMAILS 仍會保留為主要管理員後備名單。
