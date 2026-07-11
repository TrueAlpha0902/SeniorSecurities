-- SeniorSecurities Stabilization Final
-- Data integrity, durable deletion reconciliation, batched learning sync,
-- transactional release governance, and activation-code plaintext removal.

create extension if not exists pgcrypto;

-- Ensure incremental-sync timestamps exist on every user record table.
alter table if exists public.user_answer_records add column if not exists updated_at timestamptz not null default now();
alter table if exists public.user_wrong_records add column if not exists updated_at timestamptz not null default now();
alter table if exists public.user_favorite_records add column if not exists updated_at timestamptz not null default now();
alter table if exists public.user_quiz_progress add column if not exists updated_at timestamptz not null default now();
alter table if exists public.user_quiz_sessions add column if not exists updated_at timestamptz not null default now();

create index if not exists user_answer_records_user_updated_idx on public.user_answer_records (user_id, updated_at, question_id);
create index if not exists user_wrong_records_user_updated_idx on public.user_wrong_records (user_id, updated_at, question_id);
create index if not exists user_favorite_records_user_updated_idx on public.user_favorite_records (user_id, updated_at, question_id);
create index if not exists user_quiz_progress_user_updated_idx on public.user_quiz_progress (user_id, updated_at, scope_id);
create index if not exists user_quiz_sessions_user_updated_idx on public.user_quiz_sessions (user_id, updated_at, session_id);
create index if not exists question_learning_states_user_updated_idx on public.question_learning_states (user_id, updated_at, question_id);

-- Explicit deletion events prevent a partial/paginated cloud response from being
-- interpreted as a deletion of every record not returned in that response.
create table if not exists public.user_record_tombstones (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type in ('answer','wrong','favorite','progress','session')),
  record_key text not null,
  deleted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, record_type, record_key)
);

alter table public.user_record_tombstones enable row level security;
grant select, insert, update, delete on public.user_record_tombstones to authenticated;

drop policy if exists "Users can select own record tombstones" on public.user_record_tombstones;
create policy "Users can select own record tombstones" on public.user_record_tombstones
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own record tombstones" on public.user_record_tombstones;
create policy "Users can insert own record tombstones" on public.user_record_tombstones
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own record tombstones" on public.user_record_tombstones;
create policy "Users can update own record tombstones" on public.user_record_tombstones
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own record tombstones" on public.user_record_tombstones;
create policy "Users can delete own record tombstones" on public.user_record_tombstones
  for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists user_record_tombstones_sync_idx
  on public.user_record_tombstones (user_id, updated_at, record_type, record_key);

-- Batch endpoint for durable IndexedDB outbox recovery.
create or replace function public.record_learning_attempts_batch_v75(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
  recorded_count integer := 0;
  duplicate_count integer := 0;
  result jsonb;
begin
  if auth.uid() is null then raise exception '請先登入。'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'p_items must be an array'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 100 then raise exception 'batch limit is 100'; end if;

  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    result := public.record_learning_attempt_v66(
      (item->>'eventId')::uuid,
      item->>'questionId',
      coalesce(item->>'bankId', ''),
      coalesce(item->>'chapterId', ''),
      item->>'selectedAnswer',
      item->>'correctAnswer',
      coalesce((item->>'isCorrect')::boolean, false),
      coalesce(item->>'confidence', 'sure'),
      coalesce((item->>'answeredAt')::timestamptz, now()),
      nullif(item->>'sessionId', ''),
      nullif(item->>'sessionMode', ''),
      nullif(item#>>'{state,fsrsState}', '')::smallint,
      nullif(item#>>'{state,difficulty}', '')::double precision,
      nullif(item#>>'{state,stability}', '')::double precision,
      nullif(item#>>'{state,scheduledDays}', '')::integer,
      nullif(item#>>'{state,elapsedDays}', '')::integer,
      nullif(item#>>'{state,learningSteps}', '')::integer,
      nullif(item#>>'{state,reps}', '')::integer,
      nullif(item#>>'{state,lapseCount}', '')::integer,
      nullif(item#>>'{state,nextReviewAt}', '')::timestamptz,
      nullif(item#>>'{state,lastReviewAt}', '')::timestamptz,
      coalesce(nullif(item#>>'{state,algorithmVersion}', '')::integer, 2)
    );
    if coalesce((result->>'recorded')::boolean, false) then
      recorded_count := recorded_count + 1;
    else
      duplicate_count := duplicate_count + 1;
    end if;
  end loop;

  return jsonb_build_object('recorded', recorded_count, 'duplicates', duplicate_count);
end;
$$;
revoke all on function public.record_learning_attempts_batch_v75(jsonb) from public, anon, authenticated;
grant execute on function public.record_learning_attempts_batch_v75(jsonb) to authenticated, service_role;

create or replace function public.record_leaderboard_answer_events_batch_v75(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
  recorded_count integer := 0;
begin
  if auth.uid() is null then raise exception '請先登入。'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'p_items must be an array'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 100 then raise exception 'batch limit is 100'; end if;

  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if public.record_leaderboard_answer_event_v66(
      (item->>'event_id')::uuid,
      coalesce((item->>'is_correct')::boolean, false)
    ) then
      recorded_count := recorded_count + 1;
    end if;
  end loop;
  return jsonb_build_object('recorded', recorded_count);
end;
$$;
revoke all on function public.record_leaderboard_answer_events_batch_v75(jsonb) from public, anon, authenticated;
grant execute on function public.record_leaderboard_answer_events_batch_v75(jsonb) to authenticated, service_role;

-- Atomic publication pointer changes and audit recording. Only server-side
-- service-role callers can execute these functions.
create or replace function public.publish_question_release_v75(
  p_release_id uuid,
  p_actor_user_id uuid,
  p_actor_email text default null,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.question_release_batches%rowtype;
  current_active uuid;
begin
  select * into target from public.question_release_batches where id = p_release_id for update;
  if target.id is null then raise exception 'release not found'; end if;
  if target.status <> 'approved' then raise exception 'release must be approved before publication'; end if;
  if target.created_by = target.approved_by then raise exception 'two-person approval is required'; end if;

  insert into public.question_release_pointer (singleton, active_release_id, previous_release_id, updated_by, updated_at)
  values (true, null, null, p_actor_user_id, now())
  on conflict (singleton) do nothing;
  select active_release_id into current_active from public.question_release_pointer where singleton = true for update;

  update public.question_release_batches
     set status = 'published', published_by = p_actor_user_id, published_at = now()
   where id = p_release_id and status = 'approved';
  if not found then raise exception 'publication state changed concurrently'; end if;

  update public.question_release_pointer
     set previous_release_id = current_active,
         active_release_id = p_release_id,
         updated_by = p_actor_user_id,
         updated_at = now()
   where singleton = true;

  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    coalesce(nullif(trim(p_actor_email), ''), p_actor_user_id::text),
    'question_release.publish',
    jsonb_build_object('releaseId', p_release_id, 'version', target.version, 'previousReleaseId', current_active),
    p_ip_address
  );

  return jsonb_build_object('activeReleaseId', p_release_id, 'previousReleaseId', current_active);
end;
$$;
revoke all on function public.publish_question_release_v75(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.publish_question_release_v75(uuid,uuid,text,text) to service_role;

create or replace function public.rollback_question_release_v75(
  p_release_id uuid,
  p_actor_user_id uuid,
  p_actor_email text default null,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_active uuid;
  previous_active uuid;
  current_release public.question_release_batches%rowtype;
  previous_release public.question_release_batches%rowtype;
begin
  select active_release_id, previous_release_id
    into current_active, previous_active
    from public.question_release_pointer
   where singleton = true
   for update;
  if current_active is null then raise exception 'no active release'; end if;
  if current_active <> p_release_id then raise exception 'only the active release can be rolled back'; end if;
  if previous_active is null then raise exception 'no previous release is available'; end if;

  select * into current_release from public.question_release_batches where id = current_active for update;
  select * into previous_release from public.question_release_batches where id = previous_active for update;
  if current_release.status <> 'published' then raise exception 'active release is not published'; end if;
  if previous_release.status <> 'published' then raise exception 'previous release is not eligible'; end if;

  update public.question_release_batches
     set status = 'rolled_back', rolled_back_at = now()
   where id = current_active;
  update public.question_release_pointer
     set active_release_id = previous_active,
         previous_release_id = null,
         updated_by = p_actor_user_id,
         updated_at = now()
   where singleton = true;

  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    coalesce(nullif(trim(p_actor_email), ''), p_actor_user_id::text),
    'question_release.rollback',
    jsonb_build_object('rolledBackReleaseId', current_active, 'restoredReleaseId', previous_active),
    p_ip_address
  );

  return jsonb_build_object('activeReleaseId', previous_active, 'rolledBackReleaseId', current_active);
end;
$$;
revoke all on function public.rollback_question_release_v75(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.rollback_question_release_v75(uuid,uuid,text,text) to service_role;

-- Existing plaintext activation codes must not remain retrievable. New clients
-- create and display a code once, while only its SHA-256 hash and preview persist.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activation_codes' and column_name = 'code_plain'
  ) then
    execute 'update public.activation_codes set code_plain = null where code_plain is not null';
  end if;
end $$;

-- Privacy-safe client diagnostics. No email, token, question text or answers are stored.
create table if not exists public.app_client_errors (
  id bigint generated always as identity primary key,
  release_id text not null,
  route text not null,
  error_name text not null,
  error_fingerprint text not null,
  context jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.app_client_errors enable row level security;
revoke all on public.app_client_errors from public, anon, authenticated;
grant select, insert, delete on public.app_client_errors to service_role;
create index if not exists app_client_errors_created_idx on public.app_client_errors(created_at desc);
create index if not exists app_client_errors_fingerprint_idx on public.app_client_errors(error_fingerprint, created_at desc);

select pg_notify('pgrst', 'reload schema');
