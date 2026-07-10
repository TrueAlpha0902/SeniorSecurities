-- Lock down legacy RPC grants that were created before Supabase changed its
-- default function privileges. Internal helpers stay callable by function
-- owners, administrator RPCs are service-role only, and self-service RPCs are
-- limited to signed-in users.

alter function public.normalize_activation_code(text) set search_path = public;
alter function public.mask_activation_code(text) set search_path = public;
alter function public.format_activation_code(text) set search_path = public;
alter function public.default_leaderboard_display_name(uuid) set search_path = public;
alter function public.set_admin_users_updated_at() set search_path = public;

revoke all on function public.normalize_activation_code(text) from public, anon, authenticated;
revoke all on function public.activation_code_hash(text) from public, anon, authenticated;
revoke all on function public.mask_activation_code(text) from public, anon, authenticated;
revoke all on function public.format_activation_code(text) from public, anon, authenticated;
revoke all on function public.default_leaderboard_display_name(uuid) from public, anon, authenticated;
revoke all on function public.set_admin_users_updated_at() from public, anon, authenticated;

revoke all on function public.admin_list_members() from public, anon, authenticated;
revoke all on function public.admin_revoke_user_by_email(text) from public, anon, authenticated;
revoke all on function public.admin_restore_user_by_email(text) from public, anon, authenticated;
revoke all on function public.admin_reset_devices_by_email(text) from public, anon, authenticated;
revoke all on function public.admin_disable_activation_code(text) from public, anon, authenticated;

grant execute on function public.admin_list_members() to service_role;
grant execute on function public.admin_revoke_user_by_email(text) to service_role;
grant execute on function public.admin_restore_user_by_email(text) to service_role;
grant execute on function public.admin_reset_devices_by_email(text) to service_role;
grant execute on function public.admin_disable_activation_code(text) to service_role;

revoke all on function public.redeem_activation_code(text) from public, anon, authenticated;
revoke all on function public.register_current_device(text, text) from public, anon, authenticated;
revoke all on function public.ensure_leaderboard_profile() from public, anon, authenticated;
revoke all on function public.update_leaderboard_display_name(text) from public, anon, authenticated;
revoke all on function public.record_leaderboard_answer(boolean) from public, anon, authenticated;
revoke all on function public.record_leaderboard_practice_seconds(integer) from public, anon, authenticated;
revoke all on function public.touch_user_presence() from public, anon, authenticated;

grant execute on function public.redeem_activation_code(text) to authenticated, service_role;
grant execute on function public.register_current_device(text, text) to authenticated, service_role;
grant execute on function public.ensure_leaderboard_profile() to authenticated, service_role;
grant execute on function public.update_leaderboard_display_name(text) to authenticated, service_role;
grant execute on function public.record_leaderboard_answer(boolean) to authenticated, service_role;
grant execute on function public.record_leaderboard_practice_seconds(integer) to authenticated, service_role;
grant execute on function public.touch_user_presence() to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
