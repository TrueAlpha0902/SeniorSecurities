SeniorSecurities admin stable v14

This patch makes Vercel API functions more stable by removing shared relative API imports, returning JSON errors, and adding /api/admin/ping for diagnostics.

After extracting, run:
  npm run build
  npx vercel --prod

Then open:
  https://senior-securities.vercel.app/api/admin/ping

If ping says missing env, set these in Vercel Project Settings > Environment Variables:
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
  SUPABASE_SERVICE_ROLE_KEY
  ADMIN_EMAILS=true.alpha0902@gmail.com
  PASSWORD_RESET_REDIRECT_URL=https://senior-securities.vercel.app/reset-password

Also run supabase/admin-audit-v14.sql in Supabase SQL Editor.
