SeniorSecurities Admin Dashboard + Activation Generator v8

這版新增：
1. /admin 使用者管理頁
2. 登入時間與 IP 紀錄
3. 管理員取消權限 / 恢復權限 / 重置裝置
4. Windows 啟用碼產生器 PowerShell GUI
5. 可在 Windows 產生 啟用碼產生器.exe 的 build script

必做設定：

A. Supabase SQL
1. 開 Supabase SQL Editor
2. 貼上 supabase/admin-dashboard.sql
3. Run

B. Vercel Environment Variables
到 Vercel 專案 Settings > Environment Variables，加入：

VITE_SUPABASE_URL=https://你的-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=你的-publishable-key或anon-key
SUPABASE_SERVICE_ROLE_KEY=你的-service-role-key或secret-key
ADMIN_EMAILS=true.alpha0902@gmail.com

注意：SUPABASE_SERVICE_ROLE_KEY 現在是給 Vercel Serverless API 使用，不是前端公開變數。不要加 VITE_ 前綴。

C. 本機 .env.local
本機要產生啟用碼，.env.local 需包含：

VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

D. 開管理頁
部署後登入你的管理員帳號：
https://你的網站/admin

E. 產生啟用碼 .exe
1. 打開 PowerShell
2. 執行：
   cd C:\Users\speci\Documents\SeniorSecurities\desktop
   powershell -ExecutionPolicy Bypass -File .\build-activation-code-exe.ps1
3. 產生完成後開：
   啟用碼產生器.exe

如果只想先用，不想產生 .exe，也可以直接執行：
   powershell -ExecutionPolicy Bypass -File .\activation-code-generator.ps1

備註：
- IP 紀錄需要部署到 Vercel 後才會穩定取得。
- npm run dev 是 Vite 本機伺服器，不會跑 Vercel /api functions；本機測 /admin API 請用 npx vercel dev，或直接部署後測。
