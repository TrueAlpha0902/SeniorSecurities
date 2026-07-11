-- SeniorSecurities v79 final hardening
-- Server-authored sync cursors, image quiz session sync, fail-closed admin helpers,
-- and privacy-safe client telemetry controls.

create sequence if not exists public.user_sync_version_seq as bigint;
revoke all on sequence public.user_sync_version_seq from public, anon;
grant usage, select on sequence public.user_sync_version_seq to authenticated, service_role;

create or replace function public.assign_user_sync_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.sync_version := nextval('public.user_sync_version_seq');
  new.updated_at := now();
  return new;
end;
$$;

-- Every synchronized row receives a monotonically increasing server cursor.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_answer_records',
    'user_wrong_records',
    'user_favorite_records',
    'user_quiz_progress',
    'user_quiz_sessions',
    'question_learning_states',
    'user_record_tombstones'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'alter table public.%I add column if not exists sync_version bigint not null default nextval(''public.user_sync_version_seq'')',
        table_name
      );
      execute format('drop trigger if exists %I on public.%I', table_name || '_assign_sync_version', table_name);
      execute format(
        'create trigger %I before insert or update on public.%I for each row execute function public.assign_user_sync_version()',
        table_name || '_assign_sync_version',
        table_name
      );
      execute format('create index if not exists %I on public.%I (user_id, sync_version)', table_name || '_user_sync_version_idx', table_name);
    end if;
  end loop;
end $$;

-- Image-based random/mock sessions are first-class synchronized records.
create table if not exists public.user_image_quiz_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  mode text not null check (mode in ('random80', 'fullMock')),
  bank_id text not null,
  bank_title text not null,
  question_ids jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  wrong_question_ids jsonb not null default '[]'::jsonb,
  marked_question_ids jsonb not null default '[]'::jsonb,
  started_at timestamptz not null,
  last_settled_at timestamptz,
  finished_at timestamptz,
  total_questions integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  accuracy double precision not null default 0,
  duration_minutes integer,
  feedback_mode text check (feedback_mode in ('immediate', 'deferred')),
  updated_at timestamptz not null default now(),
  sync_version bigint not null default nextval('public.user_sync_version_seq'),
  primary key (user_id, session_id)
);

alter table public.user_image_quiz_sessions enable row level security;
grant select, insert, update, delete on public.user_image_quiz_sessions to authenticated;

drop policy if exists "Users can select own image quiz sessions" on public.user_image_quiz_sessions;
create policy "Users can select own image quiz sessions" on public.user_image_quiz_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own image quiz sessions" on public.user_image_quiz_sessions;
create policy "Users can insert own image quiz sessions" on public.user_image_quiz_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own image quiz sessions" on public.user_image_quiz_sessions;
create policy "Users can update own image quiz sessions" on public.user_image_quiz_sessions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own image quiz sessions" on public.user_image_quiz_sessions;
create policy "Users can delete own image quiz sessions" on public.user_image_quiz_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists user_image_quiz_sessions_assign_sync_version on public.user_image_quiz_sessions;
create trigger user_image_quiz_sessions_assign_sync_version
before insert or update on public.user_image_quiz_sessions
for each row execute function public.assign_user_sync_version();
create index if not exists user_image_quiz_sessions_user_sync_version_idx
  on public.user_image_quiz_sessions (user_id, sync_version);

-- Expand tombstones to include image sessions.
alter table public.user_record_tombstones
  drop constraint if exists user_record_tombstones_record_type_check;
alter table public.user_record_tombstones
  add constraint user_record_tombstones_record_type_check
  check (record_type in ('answer','wrong','favorite','progress','session','image_session'));

-- Atomic high-risk administrator mutation plus mandatory audit trail.
create or replace function public.set_admin_access_v79(
  p_actor_user_id uuid,
  p_actor_email text,
  p_target_user_id uuid,
  p_target_email text,
  p_role text,
  p_is_active boolean,
  p_mfa_required boolean,
  p_note text,
  p_action text,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_actor_user_id is null or p_target_email is null then raise exception 'invalid admin mutation'; end if;
  if p_role not in ('admin', 'primary_admin') then raise exception 'invalid admin role'; end if;

  insert into public.admin_users(email, role, is_active, note, created_by, updated_at)
  values (lower(trim(p_target_email)), p_role, p_is_active, nullif(trim(p_note), ''), lower(trim(p_actor_email)), now())
  on conflict (email) do update set
    role = excluded.role,
    is_active = excluded.is_active,
    note = excluded.note,
    updated_at = now();

  if p_target_user_id is not null then
    insert into public.admin_role_assignments(user_id, role, is_active, mfa_required, assigned_by, note, updated_at)
    values (p_target_user_id, p_role, p_is_active, p_mfa_required, p_actor_user_id, nullif(trim(p_note), ''), now())
    on conflict (user_id) do update set
      role = excluded.role,
      is_active = excluded.is_active,
      mfa_required = excluded.mfa_required,
      assigned_by = excluded.assigned_by,
      note = excluded.note,
      updated_at = now();
  end if;

  insert into public.admin_audit_events(actor_user_id, actor_email, target_user_id, target_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    lower(trim(p_actor_email)),
    p_target_user_id,
    lower(trim(p_target_email)),
    left(p_action, 120),
    jsonb_build_object('role', p_role, 'isActive', p_is_active, 'mfaRequired', p_mfa_required, 'hasNote', nullif(trim(p_note), '') is not null),
    p_ip_address
  );

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.set_admin_access_v79(uuid,text,uuid,text,text,boolean,boolean,text,text,text) from public, anon, authenticated;
grant execute on function public.set_admin_access_v79(uuid,text,uuid,text,text,boolean,boolean,text,text,text) to service_role;

create or replace function public.delete_admin_access_v79(
  p_actor_user_id uuid,
  p_actor_email text,
  p_target_user_id uuid,
  p_target_email text,
  p_action text,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.admin_users where email = lower(trim(p_target_email));
  if p_target_user_id is not null then
    delete from public.admin_role_assignments where user_id = p_target_user_id;
  end if;
  insert into public.admin_audit_events(actor_user_id, actor_email, target_user_id, target_email, action, metadata, ip_address)
  values (p_actor_user_id, lower(trim(p_actor_email)), p_target_user_id, lower(trim(p_target_email)), left(p_action, 120), '{}'::jsonb, p_ip_address);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.delete_admin_access_v79(uuid,text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.delete_admin_access_v79(uuid,text,uuid,text,text,text) to service_role;

-- Telemetry ingestion can be rate-limited by fingerprint and address without
-- storing raw request query strings or access tokens.
alter table if exists public.app_client_errors add column if not exists source_hash text;
create index if not exists app_client_errors_source_created_idx on public.app_client_errors(source_hash, created_at desc);

select pg_notify('pgrst', 'reload schema');

create or replace function public.create_activation_code_v79(
  p_actor_user_id uuid,
  p_actor_email text,
  p_code_hash text,
  p_code_preview text,
  p_max_uses integer,
  p_note text,
  p_custom_code boolean,
  p_ip_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_id uuid;
begin
  if p_actor_user_id is null then raise exception 'invalid actor'; end if;
  if p_max_uses < 1 or p_max_uses > 999 then raise exception 'invalid max uses'; end if;
  insert into public.activation_codes(code_hash, code_preview, max_uses, note)
  values (p_code_hash, p_code_preview, p_max_uses, nullif(trim(p_note), ''))
  returning id into created_id;
  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    lower(trim(p_actor_email)),
    'activation_code.create',
    jsonb_build_object('activationCodeId', created_id, 'maxUses', p_max_uses, 'hasNote', nullif(trim(p_note), '') is not null, 'customCode', p_custom_code),
    p_ip_address
  );
  return created_id;
end;
$$;
revoke all on function public.create_activation_code_v79(uuid,text,text,text,integer,text,boolean,text) from public, anon, authenticated;
grant execute on function public.create_activation_code_v79(uuid,text,text,text,integer,text,boolean,text) to service_role;

create or replace function public.delete_activation_code_v79(
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
begin
  select * into target from public.activation_codes where id = p_activation_code_id for update;
  if target.id is null then raise exception 'activation code not found'; end if;
  delete from public.activation_codes where id = p_activation_code_id;
  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    lower(trim(p_actor_email)),
    'activation_code.delete',
    jsonb_build_object('activationCodeId', target.id, 'codePreview', target.code_preview, 'useCount', target.use_count, 'maxUses', target.max_uses),
    p_ip_address
  );
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.delete_activation_code_v79(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.delete_activation_code_v79(uuid,text,uuid,text) to service_role;

select pg_notify('pgrst', 'reload schema');
