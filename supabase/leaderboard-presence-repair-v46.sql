-- SeniorSecurities v46
-- Purpose:
-- 1) Repair leaderboard rows for all users from cloud answer records.
-- 2) Make leaderboard RPCs available for every logged-in user.
-- 3) Make online/offline heartbeat reliable through a security-definer RPC.
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.user_leaderboard_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_leaderboard_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_correct_streak integer not null default 0 check (current_correct_streak >= 0),
  best_correct_streak integer not null default 0 check (best_correct_streak >= 0),
  total_answered integer not null default 0 check (total_answered >= 0),
  total_correct integer not null default 0 check (total_correct >= 0),
  total_practice_seconds bigint not null default 0 check (total_practice_seconds >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_leaderboard_profiles enable row level security;
alter table public.user_leaderboard_stats enable row level security;

grant select, insert, update on public.user_leaderboard_profiles to authenticated;
grant select, insert, update on public.user_leaderboard_stats to authenticated;

drop policy if exists "Authenticated users can read leaderboard profiles" on public.user_leaderboard_profiles;
create policy "Authenticated users can read leaderboard profiles" on public.user_leaderboard_profiles
  for select to authenticated using (true);

drop policy if exists "Users can insert own leaderboard profile" on public.user_leaderboard_profiles;
create policy "Users can insert own leaderboard profile" on public.user_leaderboard_profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own leaderboard profile" on public.user_leaderboard_profiles;
create policy "Users can update own leaderboard profile" on public.user_leaderboard_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can read leaderboard stats" on public.user_leaderboard_stats;
create policy "Authenticated users can read leaderboard stats" on public.user_leaderboard_stats
  for select to authenticated using (true);

drop policy if exists "Users can insert own leaderboard stats" on public.user_leaderboard_stats;
create policy "Users can insert own leaderboard stats" on public.user_leaderboard_stats
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own leaderboard stats" on public.user_leaderboard_stats;
create policy "Users can update own leaderboard stats" on public.user_leaderboard_stats
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists user_leaderboard_stats_rank_idx
  on public.user_leaderboard_stats (best_correct_streak desc, total_correct desc, updated_at asc);

create index if not exists user_leaderboard_stats_practice_time_idx
  on public.user_leaderboard_stats (total_practice_seconds desc, total_answered desc, updated_at asc);

create or replace function public.default_leaderboard_display_name(p_user_id uuid)
returns text
language sql
stable
as $$
  select '考生-' || upper(left(replace(p_user_id::text, '-', ''), 6));
$$;

grant execute on function public.default_leaderboard_display_name(uuid) to authenticated;

create or replace function public.ensure_leaderboard_profile()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  default_name text;
  final_name text;
begin
  if current_user_id is null then
    raise exception '請先登入。';
  end if;

  default_name := public.default_leaderboard_display_name(current_user_id);

  insert into public.user_leaderboard_profiles (user_id, display_name, updated_at)
  values (current_user_id, default_name, now())
  on conflict (user_id) do nothing;

  select display_name into final_name
  from public.user_leaderboard_profiles
  where user_id = current_user_id;

  return coalesce(final_name, default_name);
end;
$$;

grant execute on function public.ensure_leaderboard_profile() to authenticated;

create or replace function public.update_leaderboard_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_name text := left(regexp_replace(trim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), 24);
begin
  if current_user_id is null then
    raise exception '請先登入。';
  end if;

  if length(clean_name) < 2 then
    raise exception '排行榜名稱至少需要 2 個字。';
  end if;

  insert into public.user_leaderboard_profiles (user_id, display_name, updated_at)
  values (current_user_id, clean_name, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();
end;
$$;

grant execute on function public.update_leaderboard_display_name(text) to authenticated;

create or replace function public.record_leaderboard_answer(p_is_correct boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  next_current integer;
begin
  if current_user_id is null then
    raise exception '請先登入。';
  end if;

  perform public.ensure_leaderboard_profile();

  insert into public.user_leaderboard_stats (
    user_id,
    current_correct_streak,
    best_correct_streak,
    total_answered,
    total_correct,
    total_practice_seconds,
    updated_at
  )
  values (
    current_user_id,
    case when coalesce(p_is_correct, false) then 1 else 0 end,
    case when coalesce(p_is_correct, false) then 1 else 0 end,
    1,
    case when coalesce(p_is_correct, false) then 1 else 0 end,
    0,
    now()
  )
  on conflict (user_id) do update
    set current_correct_streak = case
          when coalesce(p_is_correct, false) then public.user_leaderboard_stats.current_correct_streak + 1
          else 0
        end,
        best_correct_streak = greatest(
          public.user_leaderboard_stats.best_correct_streak,
          case when coalesce(p_is_correct, false) then public.user_leaderboard_stats.current_correct_streak + 1 else 0 end
        ),
        total_answered = public.user_leaderboard_stats.total_answered + 1,
        total_correct = public.user_leaderboard_stats.total_correct + case when coalesce(p_is_correct, false) then 1 else 0 end,
        updated_at = now();
end;
$$;

grant execute on function public.record_leaderboard_answer(boolean) to authenticated;

create or replace function public.record_leaderboard_practice_seconds(p_seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_seconds integer := greatest(0, least(coalesce(p_seconds, 0), 3600));
begin
  if auth.uid() is null then
    raise exception '請先登入。';
  end if;

  if safe_seconds <= 0 then
    return;
  end if;

  perform public.ensure_leaderboard_profile();

  insert into public.user_leaderboard_stats (
    user_id,
    current_correct_streak,
    best_correct_streak,
    total_answered,
    total_correct,
    total_practice_seconds,
    updated_at
  )
  values (auth.uid(), 0, 0, 0, 0, safe_seconds, now())
  on conflict (user_id) do update
    set total_practice_seconds = public.user_leaderboard_stats.total_practice_seconds + safe_seconds,
        updated_at = now();
end;
$$;

grant execute on function public.record_leaderboard_practice_seconds(integer) to authenticated;

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;
grant select, insert, update on public.user_presence to authenticated;

drop policy if exists "Users can read own presence" on public.user_presence;
create policy "Users can read own presence" on public.user_presence
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert own presence" on public.user_presence;
create policy "Users can insert own presence" on public.user_presence
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own presence" on public.user_presence;
create policy "Users can update own presence" on public.user_presence
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_user_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '請先登入。';
  end if;

  insert into public.user_presence (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_seen_at = now();
end;
$$;

grant execute on function public.touch_user_presence() to authenticated;

-- Backfill leaderboard profiles and stats from cloud answer records.
-- Because user_answer_records keeps the latest answer per question, this is a best-effort recovery for users whose leaderboard RPC was not recording before.
insert into public.user_leaderboard_profiles (user_id, display_name, updated_at)
select distinct answers.user_id, public.default_leaderboard_display_name(answers.user_id), now()
from public.user_answer_records answers
left join public.user_leaderboard_profiles profiles on profiles.user_id = answers.user_id
where profiles.user_id is null
on conflict (user_id) do nothing;

with ordered_answers as (
  select
    user_id,
    is_correct,
    answered_at,
    row_number() over (partition by user_id order by answered_at asc, question_id asc) as rn,
    row_number() over (partition by user_id, is_correct order by answered_at asc, question_id asc) as rn_by_correct
  from public.user_answer_records
), streak_groups as (
  select
    user_id,
    is_correct,
    rn - rn_by_correct as grp
  from ordered_answers
), best_streaks as (
  select user_id, max(streak_len)::integer as best_correct_streak
  from (
    select user_id, grp, count(*) as streak_len
    from streak_groups
    where is_correct = true
    group by user_id, grp
  ) streaks
  group by user_id
), current_streaks as (
  select user_id, count(*)::integer as current_correct_streak
  from (
    select
      oa.*,
      sum(case when is_correct = false then 1 else 0 end) over (partition by user_id order by answered_at desc, rn desc) as wrong_seen_from_end
    from ordered_answers oa
  ) recent
  where is_correct = true and wrong_seen_from_end = 0
  group by user_id
), totals as (
  select
    user_id,
    count(*)::integer as total_answered,
    count(*) filter (where is_correct = true)::integer as total_correct,
    max(answered_at) as updated_at
  from public.user_answer_records
  group by user_id
)
insert into public.user_leaderboard_stats (
  user_id,
  current_correct_streak,
  best_correct_streak,
  total_answered,
  total_correct,
  total_practice_seconds,
  updated_at
)
select
  totals.user_id,
  coalesce(current_streaks.current_correct_streak, 0),
  coalesce(best_streaks.best_correct_streak, 0),
  totals.total_answered,
  totals.total_correct,
  0,
  coalesce(totals.updated_at, now())
from totals
left join best_streaks on best_streaks.user_id = totals.user_id
left join current_streaks on current_streaks.user_id = totals.user_id
on conflict (user_id) do update
  set current_correct_streak = greatest(public.user_leaderboard_stats.current_correct_streak, excluded.current_correct_streak),
      best_correct_streak = greatest(public.user_leaderboard_stats.best_correct_streak, excluded.best_correct_streak),
      total_answered = greatest(public.user_leaderboard_stats.total_answered, excluded.total_answered),
      total_correct = greatest(public.user_leaderboard_stats.total_correct, excluded.total_correct),
      updated_at = greatest(public.user_leaderboard_stats.updated_at, excluded.updated_at);

select pg_notify('pgrst', 'reload schema');
