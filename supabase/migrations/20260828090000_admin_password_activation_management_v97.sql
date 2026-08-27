-- SeniorSecurities v97
-- Simplify destructive member confirmation to a recent password-authenticated
-- session, add an all-question-bank activation scope, and make activation-code
-- deletion safe without losing redemption provenance.

alter table public.activation_codes
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.activation_codes
  drop constraint if exists activation_codes_deleted_inactive_check;
alter table public.activation_codes
  add constraint activation_codes_deleted_inactive_check
  check (deleted_at is null or is_active = false);

alter table public.activation_codes
  drop constraint if exists activation_codes_exam_id_check;
alter table public.activation_codes
  add constraint activation_codes_exam_id_check
  check (exam_id in ('senior-securities', 'junior-foreign-exchange', 'all'));

alter table public.activation_code_redemptions
  drop constraint if exists activation_code_redemptions_exam_id_check;
alter table public.activation_code_redemptions
  add constraint activation_code_redemptions_exam_id_check
  check (exam_id in ('senior-securities', 'junior-foreign-exchange', 'all'));

create index if not exists activation_codes_visible_created_idx
  on public.activation_codes(created_at desc)
  where deleted_at is null;

create or replace function public.verify_active_recent_password_session_v97(
  p_user_id uuid,
  p_session_id uuid,
  p_max_age_seconds integer default 600
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, auth
as $$
declare
  max_age_seconds integer := greatest(60, least(coalesce(p_max_age_seconds, 600), 600));
begin
  if p_user_id is null or p_session_id is null then
    return false;
  end if;

  return exists (
    select 1
    from auth.sessions as session
    join auth.mfa_amr_claims as amr
      on amr.session_id = session.id
    where session.id = p_session_id
      and session.user_id = p_user_id
      and (session.not_after is null or session.not_after > now())
      and session.created_at >= now() - make_interval(secs => max_age_seconds)
      and amr.authentication_method = 'password'
      and amr.created_at >= now() - make_interval(secs => max_age_seconds)
      and amr.created_at <= now() + interval '1 minute'
  );
end;
$$;

revoke all on function public.verify_active_recent_password_session_v97(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.verify_active_recent_password_session_v97(uuid, uuid, integer)
  to service_role;

create or replace function public.create_activation_code_v97(
  p_actor_user_id uuid,
  p_actor_email text,
  p_code_hash text,
  p_code_preview text,
  p_max_uses integer,
  p_note text,
  p_custom_code boolean,
  p_exam_id text,
  p_ip_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_id uuid;
  normalized_exam_id text := lower(trim(p_exam_id));
begin
  if p_actor_user_id is null then raise exception 'invalid actor'; end if;
  if p_max_uses < 1 or p_max_uses > 999 then raise exception 'invalid max uses'; end if;
  if normalized_exam_id not in ('senior-securities', 'junior-foreign-exchange', 'all') then
    raise exception 'invalid activation scope';
  end if;

  insert into public.activation_codes(
    code_hash,
    code_preview,
    max_uses,
    note,
    exam_id,
    deleted_at,
    deleted_by
  ) values (
    p_code_hash,
    p_code_preview,
    p_max_uses,
    nullif(trim(p_note), ''),
    normalized_exam_id,
    null,
    null
  )
  returning id into created_id;

  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    lower(trim(p_actor_email)),
    'activation_code.create',
    jsonb_build_object(
      'activationCodeId', created_id,
      'examId', normalized_exam_id,
      'maxUses', p_max_uses,
      'hasNote', nullif(trim(p_note), '') is not null,
      'customCode', p_custom_code
    ),
    p_ip_address
  );

  return created_id;
end;
$$;

revoke all on function public.create_activation_code_v97(uuid,text,text,text,integer,text,boolean,text,text)
  from public, anon, authenticated;
grant execute on function public.create_activation_code_v97(uuid,text,text,text,integer,text,boolean,text,text)
  to service_role;

create or replace function public.delete_activation_code_v97(
  p_actor_user_id uuid,
  p_actor_email text,
  p_activation_code_id uuid,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.activation_codes%rowtype;
  deletion_mode text;
begin
  select * into target
  from public.activation_codes
  where id = p_activation_code_id
  for update;

  if target.id is null then raise exception 'activation code not found'; end if;
  if target.deleted_at is not null then
    return jsonb_build_object('ok', true, 'mode', 'archived', 'replayed', true);
  end if;

  if target.use_count = 0 and not exists (
    select 1
    from public.activation_code_redemptions
    where activation_code_id = target.id
  ) then
    delete from public.activation_codes where id = target.id;
    deletion_mode := 'hard';
  else
    update public.activation_codes
    set is_active = false,
        deleted_at = clock_timestamp(),
        deleted_by = p_actor_user_id
    where id = target.id;
    deletion_mode := 'archived';
  end if;

  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    lower(trim(p_actor_email)),
    'activation_code.delete',
    jsonb_build_object(
      'activationCodeId', target.id,
      'codePreview', target.code_preview,
      'examId', target.exam_id,
      'useCount', target.use_count,
      'maxUses', target.max_uses,
      'deletionMode', deletion_mode
    ),
    p_ip_address
  );

  return jsonb_build_object('ok', true, 'mode', deletion_mode);
end;
$$;

revoke all on function public.delete_activation_code_v97(uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.delete_activation_code_v97(uuid,text,uuid,text)
  to service_role;

create or replace function public.set_activation_code_status_v97(
  p_actor_user_id uuid,
  p_actor_email text,
  p_activation_code_id uuid,
  p_is_active boolean,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.activation_codes%rowtype;
begin
  if p_is_active is null then raise exception 'activation code status is required'; end if;

  select * into target
  from public.activation_codes
  where id = p_activation_code_id
  for update;

  if target.id is null then raise exception 'activation code not found'; end if;
  if target.deleted_at is not null then raise exception 'deleted activation codes cannot be restored'; end if;

  update public.activation_codes
  set is_active = p_is_active
  where id = target.id;

  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    lower(trim(p_actor_email)),
    'activation_code.status_update',
    jsonb_build_object(
      'activationCodeId', target.id,
      'codePreview', target.code_preview,
      'fromActive', target.is_active,
      'toActive', p_is_active
    ),
    p_ip_address
  );

  return jsonb_build_object('ok', true, 'isActive', p_is_active);
end;
$$;

revoke all on function public.set_activation_code_status_v97(uuid,text,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.set_activation_code_status_v97(uuid,text,uuid,boolean,text)
  to service_role;

create or replace function private.redeem_activation_code_v97(
  p_code text,
  p_expected_exam_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := public.normalize_activation_code(p_code);
  normalized_exam_id text := nullif(lower(trim(coalesce(p_expected_exam_id, ''))), '');
  code_record public.activation_codes%rowtype;
begin
  if current_user_id is null then
    raise exception '請先登入後再輸入啟用碼。';
  end if;

  if normalized_exam_id is not null
     and normalized_exam_id not in ('senior-securities', 'junior-foreign-exchange') then
    raise exception '題庫種類不正確。';
  end if;

  if normalized_code is null or length(normalized_code) < 10 then
    raise exception '啟用碼格式不正確。';
  end if;

  select activation_code.*
    into code_record
    from public.activation_codes as activation_code
   where activation_code.code_hash = public.activation_code_hash(normalized_code)
   for update;

  if not found then
    raise exception '啟用碼不適用於此題庫，或不存在。';
  end if;

  if code_record.deleted_at is not null then
    raise exception '啟用碼已刪除。';
  end if;

  if normalized_exam_id is not null
     and code_record.exam_id not in (normalized_exam_id, 'all') then
    raise exception '啟用碼不適用於此題庫，或不存在。';
  end if;

  if not code_record.is_active then
    raise exception '啟用碼已停用。';
  end if;

  if exists (
    select 1
      from public.activation_code_redemptions as redemption
     where redemption.activation_code_id = code_record.id
       and redemption.user_id = current_user_id
  ) then
    raise exception '這個帳號已使用過此啟用碼。';
  end if;

  if code_record.exam_id = 'all' then
    if not exists (
      select 1
      from unnest(array['senior-securities', 'junior-foreign-exchange']::text[]) as requested(exam_id)
      where not exists (
        select 1
        from public.user_exam_entitlements as entitlement
        where entitlement.user_id = current_user_id
          and entitlement.exam_id = requested.exam_id
          and entitlement.status = 'active'
          and (entitlement.expires_at is null or entitlement.expires_at > now())
      )
    ) then
      raise exception '這個帳號已開通所有題庫，不會再次消耗啟用碼。';
    end if;
  elsif exists (
    select 1
      from public.user_exam_entitlements as entitlement
     where entitlement.user_id = current_user_id
       and entitlement.exam_id = code_record.exam_id
       and entitlement.status = 'active'
       and (entitlement.expires_at is null or entitlement.expires_at > now())
  ) then
    raise exception '這個帳號已開通此題庫，不會再次消耗啟用碼。';
  end if;

  if code_record.use_count >= code_record.max_uses then
    raise exception '啟用碼已用完。';
  end if;

  insert into public.activation_code_redemptions (
    activation_code_id,
    user_id,
    exam_id,
    redeemed_at,
    source
  ) values (
    code_record.id,
    current_user_id,
    code_record.exam_id,
    now(),
    'redeem'
  );

  update public.activation_codes
     set use_count = use_count + 1,
         redeemed_by = coalesce(redeemed_by, current_user_id),
         redeemed_at = coalesce(redeemed_at, now())
   where id = code_record.id;

  if code_record.exam_id = 'all' then
    insert into public.user_exam_entitlements (
      user_id,
      exam_id,
      plan,
      status,
      source_code_hash,
      granted_at,
      expires_at
    )
    select
      current_user_id,
      requested.exam_id,
      'full',
      'active',
      code_record.code_hash,
      now(),
      null
    from unnest(array['senior-securities', 'junior-foreign-exchange']::text[]) as requested(exam_id)
    on conflict (user_id, exam_id) do update
    set plan = 'full',
        status = 'active',
        source_code_hash = excluded.source_code_hash,
        granted_at = now(),
        expires_at = null;
  else
    insert into public.user_exam_entitlements (
      user_id,
      exam_id,
      plan,
      status,
      source_code_hash,
      granted_at,
      expires_at
    ) values (
      current_user_id,
      code_record.exam_id,
      'full',
      'active',
      code_record.code_hash,
      now(),
      null
    )
    on conflict (user_id, exam_id) do update
    set plan = 'full',
        status = 'active',
        source_code_hash = excluded.source_code_hash,
        granted_at = now(),
        expires_at = null;
  end if;

  if code_record.exam_id in ('senior-securities', 'all') then
    insert into public.user_entitlements (
      user_id,
      plan,
      status,
      source_code_hash,
      granted_at,
      expires_at
    ) values (
      current_user_id,
      'full',
      'active',
      code_record.code_hash,
      now(),
      null
    )
    on conflict (user_id) do update
    set plan = 'full',
        status = 'active',
        source_code_hash = excluded.source_code_hash,
        granted_at = now(),
        expires_at = null;
  end if;

  return true;
end;
$$;

revoke all on function private.redeem_activation_code_v97(text, text)
  from public, anon, authenticated, service_role;

create or replace function public.redeem_exam_activation_code_v94(
  p_code text,
  p_expected_exam_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if nullif(lower(trim(coalesce(p_expected_exam_id, ''))), '') is null then
    raise exception '題庫種類不正確。';
  end if;
  return private.redeem_activation_code_v97(p_code, p_expected_exam_id);
end;
$$;

create or replace function public.redeem_activation_code(p_code text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.redeem_activation_code_v97(p_code, null);
$$;

revoke all on function public.redeem_exam_activation_code_v94(text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_exam_activation_code_v94(text, text)
  to authenticated, service_role;

revoke all on function public.redeem_activation_code(text)
  from public, anon, authenticated;
grant execute on function public.redeem_activation_code(text)
  to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
