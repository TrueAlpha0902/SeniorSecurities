-- SeniorSecurities v26 stable device binding fix.
-- Safe to run multiple times.
-- This returns register_current_device to the 2-argument RPC used by the app,
-- and merges duplicate active rows with the same stable fingerprint or label.

alter table public.user_devices add column if not exists device_signature text;
create index if not exists user_devices_user_label_active_idx on public.user_devices (user_id, device_label) where revoked_at is null;

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
  normalized_fingerprint text := nullif(trim(p_device_fingerprint), '');
  normalized_label text := nullif(trim(p_device_label), '');
  existing_device public.user_devices%rowtype;
  current_active_count integer := 0;
  max_devices integer := 3;
  current_plan text := null;
  current_granted_at timestamptz := null;
  entitlement_exists boolean := false;
  allowed boolean := false;
begin
  if current_user_id is null then
    raise exception '請先登入。';
  end if;

  if normalized_fingerprint is null then
    raise exception '無法辨識裝置。';
  end if;

  select true, ue.plan, ue.granted_at
  into entitlement_exists, current_plan, current_granted_at
  from public.user_entitlements ue
  where ue.user_id = current_user_id
    and ue.status = 'active'
    and (ue.expires_at is null or ue.expires_at > now())
  limit 1;

  select * into existing_device
  from public.user_devices
  where user_id = current_user_id
    and revoked_at is null
    and device_fingerprint = normalized_fingerprint
  order by last_seen desc
  limit 1;

  if existing_device.id is null and normalized_label is not null then
    select * into existing_device
    from public.user_devices
    where user_id = current_user_id
      and revoked_at is null
      and device_label = normalized_label
    order by last_seen desc
    limit 1;
  end if;

  if existing_device.id is not null then
    update public.user_devices
    set revoked_at = now()
    where user_id = current_user_id
      and id <> existing_device.id
      and revoked_at is null
      and (
        device_fingerprint = normalized_fingerprint
        or (normalized_label is not null and device_label = normalized_label)
      );

    update public.user_devices
    set last_seen = now(),
        revoked_at = null,
        device_fingerprint = normalized_fingerprint,
        device_signature = normalized_fingerprint,
        device_label = coalesce(normalized_label, device_label)
    where id = existing_device.id;
    allowed := true;
  else
    select count(*)::integer into current_active_count
    from public.user_devices
    where user_id = current_user_id
      and revoked_at is null;

    if current_active_count < max_devices then
      insert into public.user_devices (user_id, device_fingerprint, device_label, device_signature)
      values (current_user_id, normalized_fingerprint, normalized_label, normalized_fingerprint)
      on conflict (user_id, device_fingerprint) do update
      set revoked_at = null,
          last_seen = now(),
          device_label = coalesce(excluded.device_label, public.user_devices.device_label),
          device_signature = excluded.device_signature;
      allowed := true;
    else
      allowed := false;
    end if;
  end if;

  select count(*)::integer into current_active_count
  from public.user_devices
  where user_id = current_user_id
    and revoked_at is null;

  return query
  select
    coalesce(entitlement_exists, false),
    allowed,
    current_active_count,
    max_devices,
    current_plan,
    current_granted_at;
end;
$$;

revoke all on function public.register_current_device(text, text) from public;
grant execute on function public.register_current_device(text, text) to authenticated;

-- Ask PostgREST/Supabase API to reload function metadata.
select pg_notify('pgrst', 'reload schema');
