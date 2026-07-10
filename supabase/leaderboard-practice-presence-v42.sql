-- SeniorSecurities v42
-- Purpose:
-- 1) Store total practice time for leaderboard ranking.
-- 2) Track lightweight user presence so admin can see Online / Offline.
-- 3) Store full activation code for newly generated codes so admin can see which code was used.
-- Safe to run more than once.

create extension if not exists pgcrypto;

alter table if exists public.user_leaderboard_stats
  add column if not exists total_practice_seconds bigint not null default 0 check (total_practice_seconds >= 0);

create index if not exists user_leaderboard_stats_practice_time_idx
  on public.user_leaderboard_stats (total_practice_seconds desc, total_answered desc, updated_at asc);

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

alter table if exists public.activation_codes
  add column if not exists code_plain text;

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
  formatted_code text;
begin
  if coalesce(p_max_uses, 0) < 1 then
    raise exception 'max_uses must be at least 1';
  end if;

  generated_code := coalesce(nullif(trim(p_code), ''), 'SENIOR' || encode(gen_random_bytes(8), 'hex'));
  normalized_code := public.normalize_activation_code(generated_code);
  formatted_code := public.format_activation_code(normalized_code);

  if length(normalized_code) < 10 then
    raise exception '啟用碼至少需要 10 個英數字元。';
  end if;

  insert into public.activation_codes (code_hash, code_preview, code_plain, max_uses, note)
  values (
    public.activation_code_hash(normalized_code),
    public.mask_activation_code(normalized_code),
    formatted_code,
    p_max_uses,
    p_note
  );

  return formatted_code;
end;
$$;

revoke all on function public.create_activation_code(text, text, integer) from public, anon, authenticated;
grant execute on function public.create_activation_code(text, text, integer) to service_role;

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
  values (
    auth.uid(),
    0,
    0,
    0,
    0,
    safe_seconds,
    now()
  )
  on conflict (user_id) do update
    set total_practice_seconds = public.user_leaderboard_stats.total_practice_seconds + safe_seconds,
        updated_at = now();
end;
$$;

grant execute on function public.record_leaderboard_practice_seconds(integer) to authenticated;

select pg_notify('pgrst', 'reload schema');
