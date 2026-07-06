-- SeniorSecurities user learning-record sync v16
-- Run this in Supabase SQL Editor. Safe to run more than once.
-- Purpose: make each user's answers, wrong list, favorites, quiz progress, and quiz sessions sync across devices.

create table if not exists public.user_answer_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  selected_answer text not null check (selected_answer in ('A', 'B', 'C', 'D')),
  correct_answer text not null check (correct_answer in ('A', 'B', 'C', 'D')),
  is_correct boolean not null,
  answered_at timestamptz not null,
  bank_id text not null,
  chapter text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table if not exists public.user_wrong_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  bank_id text not null,
  chapter text not null,
  last_wrong_at timestamptz not null,
  wrong_count integer not null default 1 check (wrong_count >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table if not exists public.user_favorite_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  bank_id text not null,
  chapter text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table if not exists public.user_quiz_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_id text not null,
  current_index integer not null default 0 check (current_index >= 0),
  total_questions integer not null default 0 check (total_questions >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, scope_id)
);

create table if not exists public.user_quiz_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  mode text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  total_questions integer not null default 0 check (total_questions >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  accuracy numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

alter table public.user_answer_records enable row level security;
alter table public.user_wrong_records enable row level security;
alter table public.user_favorite_records enable row level security;
alter table public.user_quiz_progress enable row level security;
alter table public.user_quiz_sessions enable row level security;

grant select, insert, update, delete on public.user_answer_records to authenticated;
grant select, insert, update, delete on public.user_wrong_records to authenticated;
grant select, insert, update, delete on public.user_favorite_records to authenticated;
grant select, insert, update, delete on public.user_quiz_progress to authenticated;
grant select, insert, update, delete on public.user_quiz_sessions to authenticated;

-- user_answer_records policies
drop policy if exists "Users can select own answer records" on public.user_answer_records;
create policy "Users can select own answer records" on public.user_answer_records
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert own answer records" on public.user_answer_records;
create policy "Users can insert own answer records" on public.user_answer_records
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own answer records" on public.user_answer_records;
create policy "Users can update own answer records" on public.user_answer_records
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own answer records" on public.user_answer_records;
create policy "Users can delete own answer records" on public.user_answer_records
  for delete to authenticated using (auth.uid() = user_id);

-- user_wrong_records policies
drop policy if exists "Users can select own wrong records" on public.user_wrong_records;
create policy "Users can select own wrong records" on public.user_wrong_records
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert own wrong records" on public.user_wrong_records;
create policy "Users can insert own wrong records" on public.user_wrong_records
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own wrong records" on public.user_wrong_records;
create policy "Users can update own wrong records" on public.user_wrong_records
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own wrong records" on public.user_wrong_records;
create policy "Users can delete own wrong records" on public.user_wrong_records
  for delete to authenticated using (auth.uid() = user_id);

-- user_favorite_records policies
drop policy if exists "Users can select own favorite records" on public.user_favorite_records;
create policy "Users can select own favorite records" on public.user_favorite_records
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert own favorite records" on public.user_favorite_records;
create policy "Users can insert own favorite records" on public.user_favorite_records
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own favorite records" on public.user_favorite_records;
create policy "Users can update own favorite records" on public.user_favorite_records
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own favorite records" on public.user_favorite_records;
create policy "Users can delete own favorite records" on public.user_favorite_records
  for delete to authenticated using (auth.uid() = user_id);

-- user_quiz_progress policies
drop policy if exists "Users can select own quiz progress" on public.user_quiz_progress;
create policy "Users can select own quiz progress" on public.user_quiz_progress
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert own quiz progress" on public.user_quiz_progress;
create policy "Users can insert own quiz progress" on public.user_quiz_progress
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own quiz progress" on public.user_quiz_progress;
create policy "Users can update own quiz progress" on public.user_quiz_progress
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own quiz progress" on public.user_quiz_progress;
create policy "Users can delete own quiz progress" on public.user_quiz_progress
  for delete to authenticated using (auth.uid() = user_id);

-- user_quiz_sessions policies
drop policy if exists "Users can select own quiz sessions" on public.user_quiz_sessions;
create policy "Users can select own quiz sessions" on public.user_quiz_sessions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert own quiz sessions" on public.user_quiz_sessions;
create policy "Users can insert own quiz sessions" on public.user_quiz_sessions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own quiz sessions" on public.user_quiz_sessions;
create policy "Users can update own quiz sessions" on public.user_quiz_sessions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own quiz sessions" on public.user_quiz_sessions;
create policy "Users can delete own quiz sessions" on public.user_quiz_sessions
  for delete to authenticated using (auth.uid() = user_id);

create index if not exists user_answer_records_user_answered_idx on public.user_answer_records (user_id, answered_at desc);
create index if not exists user_answer_records_user_bank_idx on public.user_answer_records (user_id, bank_id, chapter);
create index if not exists user_wrong_records_user_last_wrong_idx on public.user_wrong_records (user_id, last_wrong_at desc);
create index if not exists user_favorite_records_user_created_idx on public.user_favorite_records (user_id, created_at desc);
create index if not exists user_quiz_progress_user_updated_idx on public.user_quiz_progress (user_id, updated_at desc);
create index if not exists user_quiz_sessions_user_finished_idx on public.user_quiz_sessions (user_id, finished_at desc);
