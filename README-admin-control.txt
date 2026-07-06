SeniorSecurities admin controls

1) Run supabase/admin-control.sql once in Supabase SQL Editor.
2) Keep SUPABASE_SERVICE_ROLE_KEY only in local .env.local. Do not put it in Vercel public variables.
3) Use these commands from project root:

List members:
  npx tsx scripts/admin-users.ts list

Kick / revoke a paid user:
  npx tsx scripts/admin-users.ts revoke --email=user@example.com

Restore a user:
  npx tsx scripts/admin-users.ts restore --email=user@example.com

Reset devices:
  npx tsx scripts/admin-users.ts reset-devices --email=user@example.com

Disable an activation code:
  npx tsx scripts/admin-users.ts disable-code --code=SENIOR-2026-XXXX

Delete Auth account, not recommended for normal kicking:
  npx tsx scripts/admin-users.ts delete-auth --email=user@example.com
