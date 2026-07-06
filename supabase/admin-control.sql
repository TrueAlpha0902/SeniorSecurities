-- Admin controls for SeniorSecurities membership system.
-- Run this once in Supabase SQL Editor after schema.sql.
-- These functions are granted only to service_role. Do not grant them to authenticated users.

create or replace function public.admin_list_members()
returns table (
  email text,
  user_id uuid,
  entitlement_status text,
  plan text,
  granted_at timestamptz,
  expires_at timestamptz,
  active_devices integer,
  last_seen timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.email::text,
    u.id as user_id,
    coalesce(ue.status, 'none')::text as entitlement_status,
    ue.plan,
    ue.granted_at,
    ue.expires_at,
    coalesce(d.active_devices, 0)::integer as active_devices,
    d.last_seen,
    u.created_at
  from auth.users u
  left join public.user_entitlements ue on ue.user_id = u.id
  left join lateral (
    select
      count(*) filter (where ud.revoked_at is null)::integer as active_devices,
      max(ud.last_seen) as last_seen
    from public.user_devices ud
    where ud.user_id = u.id
  ) d on true
  order by u.created_at desc;
$$;

create or replace function public.admin_revoke_user_by_email(p_email text)
returns table (
  email text,
  user_id uuid,
  entitlement_status text,
  active_devices integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  normalized_email text := lower(trim(p_email));
begin
  if normalized_email is null or normalized_email = '' then
    raise exception 'email is required';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = normalized_email
  limit 1;

  if target_user_id is null then
    raise exception '找不到這個 Email 的使用者：%', p_email;
  end if;

  update public.user_entitlements
  set status = 'revoked'
  where user_id = target_user_id;

  update public.user_devices
  set revoked_at = now()
  where user_id = target_user_id
    and revoked_at is null;

  return query
  select
    u.email::text,
    u.id,
    coalesce(ue.status, 'none')::text,
    coalesce((
      select count(*)::integer
      from public.user_devices ud
      where ud.user_id = u.id and ud.revoked_at is null
    ), 0)
  from auth.users u
  left join public.user_entitlements ue on ue.user_id = u.id
  where u.id = target_user_id;
end;
$$;

create or replace function public.admin_restore_user_by_email(p_email text)
returns table (
  email text,
  user_id uuid,
  entitlement_status text,
  plan text,
  granted_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  normalized_email text := lower(trim(p_email));
begin
  if normalized_email is null or normalized_email = '' then
    raise exception 'email is required';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = normalized_email
  limit 1;

  if target_user_id is null then
    raise exception '找不到這個 Email 的使用者：%', p_email;
  end if;

  insert into public.user_entitlements (user_id, plan, status, granted_at, expires_at)
  values (target_user_id, 'full', 'active', now(), null)
  on conflict (user_id) do update
  set plan = 'full', status = 'active', granted_at = now(), expires_at = null;

  -- Do not automatically restore old devices. The user can log in again and consume device slots cleanly.
  update public.user_devices
  set revoked_at = now()
  where user_id = target_user_id
    and revoked_at is null;

  return query
  select u.email::text, u.id, ue.status::text, ue.plan, ue.granted_at
  from auth.users u
  join public.user_entitlements ue on ue.user_id = u.id
  where u.id = target_user_id;
end;
$$;

create or replace function public.admin_reset_devices_by_email(p_email text)
returns table (
  email text,
  user_id uuid,
  revoked_devices integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  normalized_email text := lower(trim(p_email));
  changed_count integer := 0;
begin
  if normalized_email is null or normalized_email = '' then
    raise exception 'email is required';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = normalized_email
  limit 1;

  if target_user_id is null then
    raise exception '找不到這個 Email 的使用者：%', p_email;
  end if;

  update public.user_devices
  set revoked_at = now()
  where user_id = target_user_id
    and revoked_at is null;

  get diagnostics changed_count = row_count;

  return query
  select u.email::text, u.id, changed_count
  from auth.users u
  where u.id = target_user_id;
end;
$$;

create or replace function public.admin_disable_activation_code(p_code text)
returns table (
  code_preview text,
  is_active boolean,
  use_count integer,
  max_uses integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_code text := public.normalize_activation_code(p_code);
begin
  if length(normalized_code) < 10 then
    raise exception '啟用碼格式不正確。';
  end if;

  update public.activation_codes
  set is_active = false
  where code_hash = public.activation_code_hash(normalized_code)
  returning activation_codes.code_preview, activation_codes.is_active, activation_codes.use_count, activation_codes.max_uses
  into code_preview, is_active, use_count, max_uses;

  if not found then
    raise exception '找不到這組啟用碼。';
  end if;

  return next;
end;
$$;

revoke all on function public.admin_list_members() from public;
revoke all on function public.admin_revoke_user_by_email(text) from public;
revoke all on function public.admin_restore_user_by_email(text) from public;
revoke all on function public.admin_reset_devices_by_email(text) from public;
revoke all on function public.admin_disable_activation_code(text) from public;

grant execute on function public.admin_list_members() to service_role;
grant execute on function public.admin_revoke_user_by_email(text) to service_role;
grant execute on function public.admin_restore_user_by_email(text) to service_role;
grant execute on function public.admin_reset_devices_by_email(text) to service_role;
grant execute on function public.admin_disable_activation_code(text) to service_role;
