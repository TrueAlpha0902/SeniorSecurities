-- SeniorSecurities v79.3
-- Restore the administration console using the existing server-side administrator
-- records. No administrator email address is embedded in application source.
-- Read-only dashboard access may use AAL1 when the database role does not require
-- MFA; destructive operations remain explicitly protected by primary_admin + AAL2.

do $$
declare
  primary_email text;
  primary_user_id uuid;
begin
  select email
    into primary_email
    from public.admin_users
   where is_active = true
     and role = 'primary_admin'
   order by created_at asc
   limit 1;

  if primary_email is null then
    select email
      into primary_email
      from public.admin_users
     where is_active = true
     order by
       case when coalesce(note, '') ilike '%主要管理員%' then 0 else 1 end,
       created_at asc
     limit 1;

    if primary_email is not null then
      update public.admin_users
         set role = 'primary_admin',
             updated_at = now()
       where email = primary_email;
    end if;
  end if;

  if primary_email is null then
    raise notice 'No active admin_users row exists; configure ADMIN_EMAILS or create an administrator before using the console.';
    return;
  end if;

  select id
    into primary_user_id
    from auth.users
   where lower(email) = lower(primary_email)
   order by created_at asc
   limit 1;

  if primary_user_id is not null then
    insert into public.admin_role_assignments (
      user_id,
      role,
      is_active,
      mfa_required,
      assigned_by,
      note,
      updated_at
    ) values (
      primary_user_id,
      'primary_admin',
      true,
      false,
      primary_user_id,
      'v79.3 管理後台主要管理員角色還原',
      now()
    )
    on conflict (user_id) do update set
      role = 'primary_admin',
      is_active = true,
      mfa_required = false,
      note = coalesce(public.admin_role_assignments.note, excluded.note),
      updated_at = now();
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
