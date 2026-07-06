-- v31: Disable device-login limits. Activation codes remain the source of access control.
-- Run this once in Supabase SQL Editor after deploying v31.

create or replace function public.register_current_device(
  p_device_fingerprint text,
  p_device_label text default null
)
returns table (
  has_entitlement boolean,
  device_allowed boolean,
  active_device_count integer,
  device_limit integer,
  plan text,
  redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  entitlement_exists boolean := false;
  current_plan text := null;
  current_granted_at timestamptz := null;
begin
  if current_user_id is null then
    raise exception '請先登入。';
  end if;

  -- Keep a lightweight last-seen device record for admin visibility only.
  -- This no longer controls access and never blocks login.
  if coalesce(trim(p_device_fingerprint), '') <> '' then
    insert into public.user_devices (user_id, device_fingerprint, device_label, last_seen, revoked_at)
    values (current_user_id, left(p_device_fingerprint, 500), left(p_device_label, 160), now(), null)
    on conflict (user_id, device_fingerprint) do update
    set device_label = coalesce(excluded.device_label, public.user_devices.device_label),
        last_seen = now(),
        revoked_at = null;
  end if;

  select true, ue.plan, ue.granted_at
    into entitlement_exists, current_plan, current_granted_at
  from public.user_entitlements ue
  where ue.user_id = current_user_id
    and ue.status = 'active'
    and (ue.expires_at is null or ue.expires_at > now())
  limit 1;

  return query select coalesce(entitlement_exists, false), true, 0, 0, current_plan, current_granted_at;
end;
$$;

revoke all on function public.register_current_device(text, text) from public;
grant execute on function public.register_current_device(text, text) to authenticated;

-- Optional: remove old self-service device revoke function if it exists.
drop function if exists public.revoke_my_device(uuid);

select pg_notify('pgrst', 'reload schema');
