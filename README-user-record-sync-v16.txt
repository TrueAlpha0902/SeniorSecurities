SeniorSecurities user learning-record sync v16

What this patch adds:
- Each logged-in user's learning records are synced to Supabase.
- Records sync across devices when the same account logs in.
- Synced record types:
  - answer records
  - wrong questions
  - favorites
  - quiz progress
  - quiz sessions/results
- Account page adds a Learning Record Sync panel with cloud status and manual sync button.

After extracting this patch:
1. Run supabase/user-record-sync-v16.sql in Supabase SQL Editor.
2. Run npm run build.
3. Deploy with npx vercel --prod.

Notes:
- This sync feature does not require a paid SMTP service.
- Supabase Free is enough for these record tables at normal small-course scale.
- On first login per device, the app uploads that device's existing local records once, then pulls cloud records.
- After that, cloud records become the source used for cross-device sync.
- If the SQL has not been run, the app will still keep local records, but cloud sync will show as not enabled.
