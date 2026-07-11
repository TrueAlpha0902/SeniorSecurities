-- Cache auth.uid() once per statement instead of re-evaluating it for every row.
-- This keeps the existing ownership rules unchanged while removing init-plan warnings.

alter policy "Users can read their own entitlement"
  on public.user_entitlements using ((select auth.uid()) = user_id);

alter policy "Users can read their own devices"
  on public.user_devices using ((select auth.uid()) = user_id);

alter policy "Users can select own answer records"
  on public.user_answer_records using ((select auth.uid()) = user_id);
alter policy "Users can insert own answer records"
  on public.user_answer_records with check ((select auth.uid()) = user_id);
alter policy "Users can update own answer records"
  on public.user_answer_records
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own answer records"
  on public.user_answer_records using ((select auth.uid()) = user_id);

alter policy "Users can select own wrong records"
  on public.user_wrong_records using ((select auth.uid()) = user_id);
alter policy "Users can insert own wrong records"
  on public.user_wrong_records with check ((select auth.uid()) = user_id);
alter policy "Users can update own wrong records"
  on public.user_wrong_records
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own wrong records"
  on public.user_wrong_records using ((select auth.uid()) = user_id);

alter policy "Users can select own favorite records"
  on public.user_favorite_records using ((select auth.uid()) = user_id);
alter policy "Users can insert own favorite records"
  on public.user_favorite_records with check ((select auth.uid()) = user_id);
alter policy "Users can update own favorite records"
  on public.user_favorite_records
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own favorite records"
  on public.user_favorite_records using ((select auth.uid()) = user_id);

alter policy "Users can select own quiz progress"
  on public.user_quiz_progress using ((select auth.uid()) = user_id);
alter policy "Users can insert own quiz progress"
  on public.user_quiz_progress with check ((select auth.uid()) = user_id);
alter policy "Users can update own quiz progress"
  on public.user_quiz_progress
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own quiz progress"
  on public.user_quiz_progress using ((select auth.uid()) = user_id);

alter policy "Users can select own quiz sessions"
  on public.user_quiz_sessions using ((select auth.uid()) = user_id);
alter policy "Users can insert own quiz sessions"
  on public.user_quiz_sessions with check ((select auth.uid()) = user_id);
alter policy "Users can update own quiz sessions"
  on public.user_quiz_sessions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own quiz sessions"
  on public.user_quiz_sessions using ((select auth.uid()) = user_id);

alter policy "Users can insert own leaderboard profile"
  on public.user_leaderboard_profiles with check ((select auth.uid()) = user_id);
alter policy "Users can update own leaderboard profile"
  on public.user_leaderboard_profiles
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can insert own leaderboard stats"
  on public.user_leaderboard_stats with check ((select auth.uid()) = user_id);
alter policy "Users can update own leaderboard stats"
  on public.user_leaderboard_stats
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can read own presence"
  on public.user_presence using ((select auth.uid()) = user_id);
alter policy "Users can insert own presence"
  on public.user_presence with check ((select auth.uid()) = user_id);
alter policy "Users can update own presence"
  on public.user_presence
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
