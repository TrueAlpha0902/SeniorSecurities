-- SeniorSecurities v13 device self-service / admin device details hotfix.
-- Run this once in Supabase SQL Editor. Safe to run multiple times.

alter table public.user_devices enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_devices'
      and policyname = 'Users can read their own devices'
  ) then
    create policy "Users can read their own devices"
      on public.user_devices
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.revoke_my_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_devices
  set revoked_at = now()
  where id = p_device_id
    and user_id = auth.uid()
    and revoked_at is null;
  return found;
end;
$$;

revoke all on function public.revoke_my_device(uuid) from public;
grant execute on function public.revoke_my_device(uuid) to authenticated;
