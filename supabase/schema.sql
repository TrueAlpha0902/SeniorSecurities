-- Senior Securities membership / activation-code schema
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_preview text not null,
  max_uses integer not null default 1 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz
);

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'full',
  status text not null default 'active' check (status in ('active', 'revoked')),
  source_code_hash text references public.activation_codes(code_hash) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_fingerprint text not null,
  device_label text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, device_fingerprint)
);

alter table public.activation_codes enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.user_devices enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_entitlements'
      and policyname = 'Users can read their own entitlement'
  ) then
    create policy "Users can read their own entitlement"
      on public.user_entitlements
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_devices'
      and policyname = 'Users can read their own devices'
  ) then
    create policy "Users can read their own devices"
      on public.user_devices
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.normalize_activation_code(input_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(input_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.activation_code_hash(input_code text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(public.normalize_activation_code(input_code), 'sha256'), 'hex');
$$;

create or replace function public.mask_activation_code(input_code text)
returns text
language sql
immutable
as $$
  select case
    when length(public.normalize_activation_code(input_code)) <= 8 then public.normalize_activation_code(input_code)
    else substr(public.normalize_activation_code(input_code), 1, 6) || '...' || right(public.normalize_activation_code(input_code), 4)
  end;
$$;

create or replace function public.format_activation_code(raw_code text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text := public.normalize_activation_code(raw_code);
  result text := '';
  index_position integer := 1;
begin
  while index_position <= length(normalized) loop
    if result <> '' then
      result := result || '-';
    end if;
    result := result || substr(normalized, index_position, 4);
    index_position := index_position + 4;
  end loop;
  return result;
end;
$$;

create or replace function public.create_activation_code(
  p_code text default null,
  p_note text default null,
  p_max_uses integer default 1
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  generated_code text;
  normalized_code text;
begin
  if coalesce(p_max_uses, 0) < 1 then
    raise exception 'max_uses must be at least 1';
  end if;

  generated_code := coalesce(nullif(trim(p_code), ''), 'SENIOR' || encode(gen_random_bytes(8), 'hex'));
  normalized_code := public.normalize_activation_code(generated_code);

  if length(normalized_code) < 10 then
    raise exception '啟用碼至少需要 10 個英數字元。';
  end if;

  insert into public.activation_codes (code_hash, code_preview, max_uses, note)
  values (
    public.activation_code_hash(normalized_code),
    public.mask_activation_code(normalized_code),
    p_max_uses,
    p_note
  );

  return public.format_activation_code(normalized_code);
end;
$$;

create or replace function public.redeem_activation_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := public.normalize_activation_code(p_code);
  code_record public.activation_codes%rowtype;
begin
  if current_user_id is null then
    raise exception '請先登入後再輸入啟用碼。';
  end if;

  if length(normalized_code) < 10 then
    raise exception '啟用碼格式不正確。';
  end if;

  update public.activation_codes
  set
    use_count = use_count + 1,
    redeemed_by = coalesce(redeemed_by, current_user_id),
    redeemed_at = coalesce(redeemed_at, now())
  where code_hash = public.activation_code_hash(normalized_code)
    and is_active = true
    and use_count < max_uses
  returning * into code_record;

  if not found then
    raise exception '啟用碼不存在、已使用或已停用。';
  end if;

  insert into public.user_entitlements (user_id, plan, status, source_code_hash, granted_at, expires_at)
  values (current_user_id, 'full', 'active', code_record.code_hash, now(), null)
  on conflict (user_id) do update
  set
    plan = 'full',
    status = 'active',
    source_code_hash = excluded.source_code_hash,
    granted_at = now(),
    expires_at = null;

  return true;
end;
$$;

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
    and device_fingerprint = normalized_fingerprint
  limit 1;

  select count(*)::integer into current_active_count
  from public.user_devices
  where user_id = current_user_id
    and revoked_at is null;

  if existing_device.id is not null and existing_device.revoked_at is null then
    update public.user_devices
    set last_seen = now(), device_label = coalesce(nullif(trim(p_device_label), ''), device_label)
    where id = existing_device.id;
    allowed := true;
  elsif current_active_count < max_devices then
    insert into public.user_devices (user_id, device_fingerprint, device_label)
    values (current_user_id, normalized_fingerprint, nullif(trim(p_device_label), ''))
    on conflict (user_id, device_fingerprint) do update
    set revoked_at = null,
        last_seen = now(),
        device_label = coalesce(excluded.device_label, public.user_devices.device_label);
    current_active_count := current_active_count + 1;
    allowed := true;
  else
    allowed := false;
  end if;

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

create or replace function public.revoke_my_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_devices
  set revoked_at = now()
  where id = p_device_id
    and user_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.create_activation_code(text, text, integer) from public;
revoke all on function public.redeem_activation_code(text) from public;
revoke all on function public.register_current_device(text, text) from public;
revoke all on function public.revoke_my_device(uuid) from public;

grant execute on function public.create_activation_code(text, text, integer) to service_role;
grant execute on function public.redeem_activation_code(text) to authenticated;
grant execute on function public.register_current_device(text, text) to authenticated;
grant execute on function public.revoke_my_device(uuid) to authenticated;
