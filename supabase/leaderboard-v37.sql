-- SeniorSecurities leaderboard v37
-- Run this in Supabase SQL Editor. Safe to run more than once.
-- Purpose:
-- 1) Users join the leaderboard automatically after answering questions.
-- 2) Users get a default public display name such as 考生-ABC123.
-- 3) Users may later change that public display name.
-- 4) Admin can delete a user's leaderboard profile/stats through the admin API.

create table if not exists public.user_leaderboard_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_leaderboard_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_correct_streak integer not null default 0 check (current_correct_streak >= 0),
  best_correct_streak integer not null default 0 check (best_correct_streak >= 0),
  total_answered integer not null default 0 check (total_answered >= 0),
  total_correct integer not null default 0 check (total_correct >= 0),
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

create or replace function public.default_leaderboard_display_name(p_user_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select '考生-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6));
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
  current_name text;
begin
  if current_user_id is null then
    raise exception '請先登入。';
  end if;

  default_name := public.default_leaderboard_display_name(current_user_id);

  insert into public.user_leaderboard_profiles (user_id, display_name, updated_at)
  values (current_user_id, default_name, now())
  on conflict (user_id) do nothing;

  select display_name into current_name
  from public.user_leaderboard_profiles
  where user_id = current_user_id;

  return coalesce(current_name, default_name);
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
  normalized_name text := trim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then
    raise exception '請先登入。';
  end if;

  if char_length(normalized_name) < 2 or char_length(normalized_name) > 24 then
    raise exception '排行榜名稱需要 2 到 24 個字。';
  end if;

  insert into public.user_leaderboard_profiles (user_id, display_name, updated_at)
  values (auth.uid(), normalized_name, now())
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
begin
  if auth.uid() is null then
    raise exception '請先登入。';
  end if;

  perform public.ensure_leaderboard_profile();

  insert into public.user_leaderboard_stats (
    user_id,
    current_correct_streak,
    best_correct_streak,
    total_answered,
    total_correct,
    updated_at
  )
  values (
    auth.uid(),
    case when coalesce(p_is_correct, false) then 1 else 0 end,
    case when coalesce(p_is_correct, false) then 1 else 0 end,
    1,
    case when coalesce(p_is_correct, false) then 1 else 0 end,
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

-- Backfill default display names for users who already have leaderboard stats but no profile.
insert into public.user_leaderboard_profiles (user_id, display_name, updated_at)
select stats.user_id, public.default_leaderboard_display_name(stats.user_id), now()
from public.user_leaderboard_stats stats
left join public.user_leaderboard_profiles profiles on profiles.user_id = stats.user_id
where profiles.user_id is null
on conflict (user_id) do nothing;

select pg_notify('pgrst', 'reload schema');
