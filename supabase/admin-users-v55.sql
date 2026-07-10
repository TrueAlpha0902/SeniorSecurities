-- SeniorSecurities v55
-- 管理員帳號資料表。之後可以用 desktop/AdminAccountManager.exe 新增或停用管理員。
-- 這份 SQL 可重複執行。

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'admin',
  is_active boolean not null default true,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_email_lowercase check (email = lower(email)),
  constraint admin_users_role_check check (role in ('admin'))
);

create or replace function public.set_admin_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_users_updated_at on public.admin_users;
create trigger set_admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_admin_users_updated_at();

-- 管理員名單不給一般使用者讀取。Vercel 後端與桌面工具使用 service role key，可正常管理。
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

-- 保留你原本的主要管理員帳號，避免資料表啟用後自己被鎖在外面。
insert into public.admin_users (email, role, is_active, note, created_by)
values ('true.alpha0902@gmail.com', 'admin', true, '主要管理員', 'v55 bootstrap')
on conflict (email) do update
  set is_active = true,
      role = 'admin',
      note = coalesce(public.admin_users.note, excluded.note),
      updated_at = now();

select pg_notify('pgrst', 'reload schema');
