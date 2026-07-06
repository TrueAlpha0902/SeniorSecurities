SeniorSecurities password reset production redirect fix v12

Purpose:
- Password reset emails should go to the public Vercel site, not localhost.
- The client forgot-password page now defaults to https://senior-securities.vercel.app/reset-password.
- The admin API reset-password action also defaults to the same production URL if no env var is set.

After applying patch:
1. Add these to .env.local for local testing if missing:
   VITE_PUBLIC_SITE_URL=https://senior-securities.vercel.app
   VITE_PASSWORD_RESET_REDIRECT_URL=https://senior-securities.vercel.app/reset-password

2. Add this to Vercel Environment Variables:
   PASSWORD_RESET_REDIRECT_URL=https://senior-securities.vercel.app/reset-password
   VITE_PUBLIC_SITE_URL=https://senior-securities.vercel.app
   VITE_PASSWORD_RESET_REDIRECT_URL=https://senior-securities.vercel.app/reset-password

3. Supabase Dashboard > Authentication > URL Configuration:
   Site URL: https://senior-securities.vercel.app
   Redirect URLs must include:
   https://senior-securities.vercel.app/reset-password

4. Rebuild and redeploy.
