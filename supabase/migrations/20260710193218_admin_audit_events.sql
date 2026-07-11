create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text,
  action text not null check (length(action) between 1 and 120),
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_events enable row level security;

revoke all on table public.admin_audit_events from public, anon, authenticated;
grant select, insert on table public.admin_audit_events to service_role;

create index if not exists admin_audit_events_created_at_idx
  on public.admin_audit_events (created_at desc);

create index if not exists admin_audit_events_target_user_created_at_idx
  on public.admin_audit_events (target_user_id, created_at desc)
  where target_user_id is not null;
