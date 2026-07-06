-- SeniorSecurities admin audit stability patch v14
-- Run this in Supabase SQL Editor. It is safe to run more than once.

create table if not exists public.login_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  event_type text not null default 'session_seen',
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.login_audit_events enable row level security;

create index if not exists login_audit_events_user_id_created_at_idx
  on public.login_audit_events (user_id, created_at desc);

create index if not exists login_audit_events_email_created_at_idx
  on public.login_audit_events (lower(email), created_at desc);

revoke all on public.login_audit_events from public;
grant select, insert, update, delete on public.login_audit_events to service_role;

-- The user_devices table was created in the original schema. These columns are expected by the admin UI.
alter table public.user_devices add column if not exists device_label text;
alter table public.user_devices add column if not exists first_seen timestamptz default now();
alter table public.user_devices add column if not exists last_seen timestamptz default now();
alter table public.user_devices add column if not exists revoked_at timestamptz;

create index if not exists user_devices_user_id_last_seen_idx
  on public.user_devices (user_id, last_seen desc);
