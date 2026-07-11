-- SeniorSecurities v66
-- Append-only learning events, FSRS adaptive question state, idempotent
-- leaderboard events, user-id RBAC/MFA enforcement support, and immutable
-- question-release governance.

create extension if not exists pgcrypto;

create table if not exists public.answer_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  bank_id text not null,
  chapter_id text not null,
  session_id text,
  session_mode text,
  selected_answer text not null check (selected_answer in ('A','B','C','D','1','2','3','4')),
  correct_answer text not null check (correct_answer in ('A','B','C','D','1','2','3','4')),
  is_correct boolean not null,
  confidence text not null default 'sure' check (confidence in ('sure','unsure','guess','unknown')),
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create index if not exists answer_attempts_user_answered_idx
  on public.answer_attempts (user_id, answered_at desc);
create index if not exists answer_attempts_user_question_idx
  on public.answer_attempts (user_id, question_id, answered_at desc);
create index if not exists answer_attempts_session_idx
  on public.answer_attempts (user_id, session_id)
  where session_id is not null;

create table if not exists public.question_learning_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  bank_id text not null,
  chapter_id text not null,
  leitner_box smallint not null default 0 check (leitner_box between 0 and 5),
  stage text not null default 'new' check (stage in ('new','learning','review','mastered')),
  next_review_at timestamptz not null default now(),
  success_count integer not null default 0 check (success_count >= 0),
  lapse_count integer not null default 0 check (lapse_count >= 0),
  last_confidence text not null default 'sure' check (last_confidence in ('sure','unsure','guess','unknown')),
  last_answered_at timestamptz not null default now(),
  fsrs_state smallint not null default 0 check (fsrs_state between 0 and 3),
  difficulty double precision not null default 0 check (difficulty >= 0),
  stability double precision not null default 0 check (stability >= 0),
  scheduled_days integer not null default 0 check (scheduled_days >= 0),
  elapsed_days integer not null default 0 check (elapsed_days >= 0),
  learning_steps integer not null default 0 check (learning_steps >= 0),
  reps integer not null default 0 check (reps >= 0),
  last_review_at timestamptz,
  algorithm_version integer not null default 2 check (algorithm_version >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- Safe if an earlier development copy created the table without FSRS fields.
alter table public.question_learning_states add column if not exists fsrs_state smallint not null default 0;
alter table public.question_learning_states add column if not exists difficulty double precision not null default 0;
alter table public.question_learning_states add column if not exists stability double precision not null default 0;
alter table public.question_learning_states add column if not exists scheduled_days integer not null default 0;
alter table public.question_learning_states add column if not exists elapsed_days integer not null default 0;
alter table public.question_learning_states add column if not exists learning_steps integer not null default 0;
alter table public.question_learning_states add column if not exists reps integer not null default 0;
alter table public.question_learning_states add column if not exists last_review_at timestamptz;
alter table public.question_learning_states add column if not exists algorithm_version integer not null default 2;

create index if not exists question_learning_states_due_idx
  on public.question_learning_states (user_id, next_review_at);
create index if not exists question_learning_states_stage_idx
  on public.question_learning_states (user_id, stage, next_review_at);

alter table public.answer_attempts enable row level security;
alter table public.question_learning_states enable row level security;

revoke all on public.answer_attempts from anon, authenticated;
revoke all on public.question_learning_states from anon, authenticated;
grant select on public.answer_attempts to authenticated;
grant select on public.question_learning_states to authenticated;

drop policy if exists "Users read own answer attempts" on public.answer_attempts;
create policy "Users read own answer attempts"
  on public.answer_attempts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read own learning states" on public.question_learning_states;
create policy "Users read own learning states"
  on public.question_learning_states for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.prevent_answer_attempt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Auth/user deletion cascades and controlled maintenance must remain possible.
  if current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'answer_attempts is append-only';
end;
$$;

revoke all on function public.prevent_answer_attempt_mutation() from public, anon, authenticated;

drop trigger if exists answer_attempts_immutable on public.answer_attempts;
create trigger answer_attempts_immutable
before update or delete on public.answer_attempts
for each row execute function public.prevent_answer_attempt_mutation();

-- Remove the early development signature if it exists, preventing PostgREST
-- overload ambiguity after adding FSRS state arguments.
drop function if exists public.record_learning_attempt_v66(uuid,text,text,text,text,text,boolean,text,timestamptz,text,text);
drop function if exists public.record_learning_attempt_v66(uuid,text,text,text,text,text,boolean,text,timestamptz,text,text,smallint,double precision,double precision,integer,integer,integer,integer,integer,timestamptz,timestamptz,integer);

create function public.record_learning_attempt_v66(
  p_event_id uuid,
  p_question_id text,
  p_bank_id text,
  p_chapter_id text,
  p_selected_answer text,
  p_correct_answer text,
  p_is_correct boolean,
  p_confidence text default 'sure',
  p_answered_at timestamptz default now(),
  p_session_id text default null,
  p_session_mode text default null,
  p_fsrs_state smallint default null,
  p_difficulty double precision default null,
  p_stability double precision default null,
  p_scheduled_days integer default null,
  p_elapsed_days integer default null,
  p_learning_steps integer default null,
  p_reps integer default null,
  p_lapses integer default null,
  p_next_review_at timestamptz default null,
  p_last_review_at timestamptz default null,
  p_algorithm_version integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_confidence text := lower(coalesce(p_confidence, 'sure'));
  previous_box integer := 0;
  next_box integer := 1;
  next_stage text := 'learning';
  fallback_interval_days integer := 1;
  effective_scheduled_days integer := greatest(0, coalesce(p_scheduled_days, 0));
  effective_reps integer := greatest(0, coalesce(p_reps, 0));
  effective_lapses integer := greatest(0, coalesce(p_lapses, 0));
  effective_fsrs_state smallint := greatest(0, least(3, coalesce(p_fsrs_state, 0)));
  effective_review_at timestamptz := coalesce(p_answered_at, now());
  effective_next_review_at timestamptz;
  inserted_id uuid;
begin
  if current_user_id is null then
    raise exception '請先登入。';
  end if;
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;
  if nullif(trim(p_question_id), '') is null then
    raise exception 'question_id is required';
  end if;
  if clean_confidence not in ('sure','unsure','guess','unknown') then
    raise exception 'invalid confidence';
  end if;
  if p_selected_answer not in ('A','B','C','D','1','2','3','4')
     or p_correct_answer not in ('A','B','C','D','1','2','3','4') then
    raise exception 'invalid answer';
  end if;

  insert into public.answer_attempts (
    event_id, user_id, question_id, bank_id, chapter_id, session_id, session_mode,
    selected_answer, correct_answer, is_correct, confidence, answered_at
  ) values (
    p_event_id, current_user_id, trim(p_question_id), coalesce(trim(p_bank_id), ''),
    coalesce(trim(p_chapter_id), ''), nullif(trim(p_session_id), ''), nullif(trim(p_session_mode), ''),
    p_selected_answer, p_correct_answer, coalesce(p_is_correct, false), clean_confidence,
    effective_review_at
  )
  on conflict (user_id, event_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return jsonb_build_object('recorded', false, 'duplicate', true);
  end if;

  select leitner_box into previous_box
  from public.question_learning_states
  where user_id = current_user_id and question_id = trim(p_question_id);
  previous_box := coalesce(previous_box, 0);

  if p_scheduled_days is not null then
    next_box := case
      when effective_fsrs_state = 0 then 0
      when effective_scheduled_days <= 1 then 1
      when effective_scheduled_days <= 3 then 2
      when effective_scheduled_days <= 7 then 3
      when effective_scheduled_days <= 21 then 4
      else 5
    end;
    next_stage := case
      when effective_fsrs_state = 0 then 'new'
      when effective_fsrs_state in (1, 3) then 'learning'
      when effective_scheduled_days >= 21 and effective_reps >= 3 then 'mastered'
      else 'review'
    end;
  else
    -- Backward-compatible fallback for an older client.
    if not coalesce(p_is_correct, false) or clean_confidence = 'unknown' then
      next_box := 1;
    elsif clean_confidence = 'guess' then
      next_box := least(2, greatest(1, previous_box));
    elsif clean_confidence = 'unsure' then
      next_box := least(4, greatest(1, previous_box + 1));
    else
      next_box := least(5, greatest(1, previous_box + 1));
    end if;
    fallback_interval_days := case next_box
      when 1 then 1 when 2 then 3 when 3 then 7 when 4 then 14 else 30
    end;
    effective_scheduled_days := fallback_interval_days;
    effective_reps := 1;
    effective_lapses := case when coalesce(p_is_correct, false) then 0 else 1 end;
    effective_fsrs_state := case when next_box <= 2 then 1 else 2 end;
    next_stage := case when next_box <= 2 then 'learning' when next_box <= 4 then 'review' else 'mastered' end;
  end if;

  effective_next_review_at := coalesce(
    p_next_review_at,
    effective_review_at + make_interval(days => greatest(0, effective_scheduled_days))
  );

  insert into public.question_learning_states (
    user_id, question_id, bank_id, chapter_id, leitner_box, stage, next_review_at,
    success_count, lapse_count, last_confidence, last_answered_at,
    fsrs_state, difficulty, stability, scheduled_days, elapsed_days,
    learning_steps, reps, last_review_at, algorithm_version, updated_at
  ) values (
    current_user_id, trim(p_question_id), coalesce(trim(p_bank_id), ''), coalesce(trim(p_chapter_id), ''),
    next_box, next_stage, effective_next_review_at,
    case when coalesce(p_is_correct, false) then 1 else 0 end,
    effective_lapses,
    clean_confidence, effective_review_at,
    effective_fsrs_state, greatest(0, coalesce(p_difficulty, 0)), greatest(0, coalesce(p_stability, 0)),
    effective_scheduled_days, greatest(0, coalesce(p_elapsed_days, 0)),
    greatest(0, coalesce(p_learning_steps, 0)), effective_reps,
    coalesce(p_last_review_at, effective_review_at), greatest(1, coalesce(p_algorithm_version, 2)), now()
  )
  on conflict (user_id, question_id) do update set
    bank_id = excluded.bank_id,
    chapter_id = excluded.chapter_id,
    leitner_box = excluded.leitner_box,
    stage = excluded.stage,
    next_review_at = excluded.next_review_at,
    success_count = public.question_learning_states.success_count + case when coalesce(p_is_correct, false) then 1 else 0 end,
    lapse_count = greatest(public.question_learning_states.lapse_count, excluded.lapse_count),
    last_confidence = excluded.last_confidence,
    last_answered_at = excluded.last_answered_at,
    fsrs_state = excluded.fsrs_state,
    difficulty = excluded.difficulty,
    stability = excluded.stability,
    scheduled_days = excluded.scheduled_days,
    elapsed_days = excluded.elapsed_days,
    learning_steps = excluded.learning_steps,
    reps = greatest(public.question_learning_states.reps + 1, excluded.reps),
    last_review_at = excluded.last_review_at,
    algorithm_version = excluded.algorithm_version,
    updated_at = now();

  return jsonb_build_object(
    'recorded', true,
    'questionId', trim(p_question_id),
    'box', next_box,
    'stage', next_stage,
    'nextReviewAt', effective_next_review_at,
    'algorithmVersion', greatest(1, coalesce(p_algorithm_version, 2))
  );
end;
$$;

revoke all on function public.record_learning_attempt_v66(uuid,text,text,text,text,text,boolean,text,timestamptz,text,text,smallint,double precision,double precision,integer,integer,integer,integer,integer,timestamptz,timestamptz,integer)
  from public, anon, authenticated;
grant execute on function public.record_learning_attempt_v66(uuid,text,text,text,text,text,boolean,text,timestamptz,text,text,smallint,double precision,double precision,integer,integer,integer,integer,integer,timestamptz,timestamptz,integer)
  to authenticated, service_role;

create or replace function public.get_learning_summary_v66()
returns table (
  total_count bigint,
  new_count bigint,
  learning_count bigint,
  review_count bigint,
  mastered_count bigint,
  due_count bigint
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select
    count(*)::bigint,
    count(*) filter (where stage = 'new')::bigint,
    count(*) filter (where stage = 'learning')::bigint,
    count(*) filter (where stage = 'review')::bigint,
    count(*) filter (where stage = 'mastered')::bigint,
    count(*) filter (where next_review_at <= now())::bigint
  from public.question_learning_states
  where user_id = (select auth.uid());
$$;

revoke all on function public.get_learning_summary_v66() from public, anon, authenticated;
grant execute on function public.get_learning_summary_v66() to authenticated, service_role;

create table if not exists public.leaderboard_answer_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table public.leaderboard_answer_events enable row level security;
revoke all on public.leaderboard_answer_events from anon, authenticated;

create or replace function public.record_leaderboard_answer_event_v66(
  p_event_id uuid,
  p_is_correct boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  inserted_count integer := 0;
begin
  if current_user_id is null then raise exception '請先登入。'; end if;
  if p_event_id is null then raise exception 'event_id is required'; end if;

  insert into public.leaderboard_answer_events (user_id, event_id, is_correct)
  values (current_user_id, p_event_id, coalesce(p_is_correct, false))
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;

  perform public.record_leaderboard_answer(coalesce(p_is_correct, false));
  return true;
end;
$$;

revoke all on function public.record_leaderboard_answer_event_v66(uuid,boolean) from public, anon, authenticated;
grant execute on function public.record_leaderboard_answer_event_v66(uuid,boolean) to authenticated, service_role;

-- User-id based admin roles. Email remains a bootstrap fallback until every
-- administrator has logged in once and has a user_id assignment.
alter table if exists public.admin_users drop constraint if exists admin_users_role_check;
alter table if exists public.admin_users add constraint admin_users_role_check
  check (role in ('primary_admin','admin','content_reviewer','support_admin'));

create table if not exists public.admin_role_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('primary_admin','admin','content_reviewer','support_admin')),
  is_active boolean not null default true,
  mfa_required boolean not null default false,
  assigned_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_role_assignments enable row level security;
revoke all on public.admin_role_assignments from anon, authenticated;

-- Immutable question release workflow.
create table if not exists public.question_release_batches (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null default 'draft' check (status in ('draft','in_review','approved','published','rolled_back')),
  title text not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  rolled_back_at timestamptz
);

create table if not exists public.question_release_items (
  release_id uuid not null references public.question_release_batches(id) on delete cascade,
  question_id text not null,
  payload jsonb not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  primary key (release_id, question_id)
);

create table if not exists public.question_release_pointer (
  singleton boolean primary key default true check (singleton),
  active_release_id uuid references public.question_release_batches(id) on delete restrict,
  previous_release_id uuid references public.question_release_batches(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.question_release_batches enable row level security;
alter table public.question_release_items enable row level security;
alter table public.question_release_pointer enable row level security;
revoke all on public.question_release_batches from anon, authenticated;
revoke all on public.question_release_items from anon, authenticated;
revoke all on public.question_release_pointer from anon, authenticated;

create or replace function public.prevent_published_release_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' and old.status in ('published','rolled_back') then
    raise exception 'Published releases are immutable';
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' and new.status = 'rolled_back' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('published','rolled_back') then
    raise exception 'Published releases are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.prevent_published_release_mutation() from public, anon, authenticated;

drop trigger if exists question_release_immutable on public.question_release_batches;
create trigger question_release_immutable
before update or delete on public.question_release_batches
for each row execute function public.prevent_published_release_mutation();

create or replace function public.prevent_published_release_item_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  release_status text;
begin
  if tg_op = 'DELETE' then
    select status into release_status from public.question_release_batches where id = old.release_id;
  else
    select status into release_status from public.question_release_batches where id = new.release_id;
  end if;
  if release_status in ('published','rolled_back') then
    raise exception 'Published release items are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.prevent_published_release_item_mutation() from public, anon, authenticated;

drop trigger if exists question_release_items_immutable on public.question_release_items;
create trigger question_release_items_immutable
before update or delete on public.question_release_items
for each row execute function public.prevent_published_release_item_mutation();

select pg_notify('pgrst', 'reload schema');
