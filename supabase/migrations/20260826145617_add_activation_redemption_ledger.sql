-- SeniorSecurities v95
-- Keep an append-only, privacy-preserving record of each activation-code
-- redemption. This supports administrator grouping by code without storing the
-- plaintext code and prevents duplicate consumption for every new or
-- reconstructable account/code pair. Unattributed legacy gaps stay explicit.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

alter table public.activation_codes
  add column if not exists redemption_history_gap integer not null default 0
  check (redemption_history_gap >= 0);

create unique index if not exists activation_codes_id_exam_unique
  on public.activation_codes (id, exam_id);

create table if not exists public.activation_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  activation_code_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  exam_id text not null check (exam_id in ('senior-securities', 'junior-foreign-exchange')),
  redeemed_at timestamptz not null default now(),
  source text not null default 'redeem' check (source in ('redeem', 'legacy_entitlement')),
  foreign key (activation_code_id, exam_id)
    references public.activation_codes(id, exam_id) on delete restrict,
  unique (activation_code_id, user_id)
);

create index if not exists activation_code_redemptions_code_redeemed_idx
  on public.activation_code_redemptions (activation_code_id, redeemed_at desc);
create index if not exists activation_code_redemptions_user_redeemed_idx
  on public.activation_code_redemptions (user_id, redeemed_at desc)
  where user_id is not null;

alter table public.activation_code_redemptions enable row level security;
revoke all on table public.activation_code_redemptions from public, anon, authenticated, service_role;
grant select on table public.activation_code_redemptions to service_role;

-- The password-reset endpoint already relies on this server-only throttle
-- table. Bring it into the reproducible migration chain and make account
-- deletion able to remove the target email before the irreversible Auth step.
create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  target_user_id uuid references auth.users(id) on delete cascade,
  request_kind text not null check (request_kind in ('admin', 'self')),
  status text not null check (status in ('sent', 'blocked', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.password_reset_requests
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade;

create index if not exists password_reset_requests_email_created_idx
  on public.password_reset_requests (email, created_at desc);
create index if not exists password_reset_requests_target_created_idx
  on public.password_reset_requests (target_user_id, created_at desc)
  where target_user_id is not null;
alter table public.password_reset_requests enable row level security;
revoke all on table public.password_reset_requests from public, anon, authenticated, service_role;
grant select, insert, delete on table public.password_reset_requests to service_role;

-- Persist the destructive-operation state independently of auth.users so a
-- timeout or retry can reconcile a completed Auth deletion without reporting
-- a false failure. No plaintext member email is stored here.
create table if not exists public.admin_member_deletion_operations (
  operation_id uuid primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid,
  target_fingerprint text not null check (target_fingerprint ~ '^[0-9a-f]{64}$'),
  target_email_fingerprint text not null check (target_email_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    (status = 'pending' and target_user_id is not null and lease_token is not null and lease_expires_at is not null)
    or
    (status in ('completed', 'failed') and target_user_id is null and lease_token is null and lease_expires_at is null)
  )
);

create unique index if not exists admin_member_deletion_one_pending_target_idx
  on public.admin_member_deletion_operations (target_fingerprint)
  where status = 'pending';
alter table public.admin_member_deletion_operations enable row level security;
revoke all on table public.admin_member_deletion_operations from public, anon, authenticated, service_role;
grant select on table public.admin_member_deletion_operations to service_role;

-- Claiming is atomic per target. Expired leases can be taken over even when a
-- browser refresh generated a new operation id; every later transition is
-- compare-and-set by the private lease token so stale workers cannot overwrite
-- a completed result.
create or replace function public.claim_member_deletion_operation_v95(
  p_operation_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_target_fingerprint text,
  p_target_email_fingerprint text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_lease_token uuid := gen_random_uuid();
  v_row public.admin_member_deletion_operations%rowtype;
  v_requested public.admin_member_deletion_operations%rowtype;
  v_auth_delete_started boolean := false;
begin
  if p_operation_id is null or p_actor_user_id is null or p_target_user_id is null then
    raise exception 'invalid member deletion claim' using errcode = '22023';
  end if;
  if p_target_fingerprint is null or p_target_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member deletion fingerprint' using errcode = '22023';
  end if;
  if p_target_email_fingerprint is null or p_target_email_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member deletion email fingerprint' using errcode = '22023';
  end if;

  p_lease_seconds := greatest(60, least(coalesce(p_lease_seconds, 600), 900));
  -- set_admin_access_v79 writes admin_users before admin_role_assignments, so
  -- every dual-lock path follows the same email-then-user order.
  perform pg_advisory_xact_lock(hashtextextended(p_target_email_fingerprint, 0));
  if p_target_fingerprint <> p_target_email_fingerprint then
    perform pg_advisory_xact_lock(hashtextextended(p_target_fingerprint, 0));
  end if;

  select * into v_requested
  from public.admin_member_deletion_operations
  where operation_id = p_operation_id
  for update;

  if found then
    if v_requested.target_fingerprint is distinct from p_target_fingerprint
      or v_requested.target_email_fingerprint is distinct from p_target_email_fingerprint
      or (
        v_requested.status = 'pending'
        and v_requested.target_user_id is distinct from p_target_user_id
      )
    then
      return jsonb_build_object('state', 'conflict');
    end if;
    if v_requested.status = 'completed' then
      return jsonb_build_object(
        'state', 'completed',
        'operationId', v_requested.operation_id,
        'result', v_requested.result
      );
    end if;
  end if;

  -- A completed operation for this stable target always wins over an older
  -- failed operation id supplied by a refreshed browser.
  select * into v_row
  from public.admin_member_deletion_operations
  where target_fingerprint = p_target_fingerprint
    and status = 'completed'
  order by completed_at desc nulls last, updated_at desc
  limit 1;

  if found then
    if v_row.target_email_fingerprint is distinct from p_target_email_fingerprint
    then
      return jsonb_build_object('state', 'conflict');
    end if;
    return jsonb_build_object(
      'state', 'completed',
      'operationId', v_row.operation_id,
      'result', v_row.result
    );
  end if;

  select * into v_row
  from public.admin_member_deletion_operations
  where target_fingerprint = p_target_fingerprint
    and status = 'pending'
  for update;

  if found then
    if v_row.target_user_id is distinct from p_target_user_id
      or v_row.target_email_fingerprint is distinct from p_target_email_fingerprint
    then
      return jsonb_build_object('state', 'conflict');
    end if;
    if v_row.lease_expires_at > v_now then
      return jsonb_build_object('state', 'in_progress', 'operationId', v_row.operation_id);
    end if;

    v_auth_delete_started := v_row.result @> '{"authDeleteStarted":true}'::jsonb;
    update public.admin_member_deletion_operations
    set actor_user_id = p_actor_user_id,
        lease_token = v_lease_token,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        result = case when v_auth_delete_started then v_row.result else '{}'::jsonb end,
        updated_at = v_now,
        completed_at = null
    where operation_id = v_row.operation_id;

    return jsonb_build_object(
      'state', 'claimed',
      'operationId', v_row.operation_id,
      'leaseToken', v_lease_token,
      'resumed', true,
      'authDeleteStarted', v_auth_delete_started
    );
  end if;

  -- With no completed or pending operation for this target, an exact failed
  -- operation id can safely be resumed.
  if v_requested.operation_id is not null then
    v_auth_delete_started := v_requested.result @> '{"authDeleteStarted":true}'::jsonb
      or v_requested.result ->> 'stage' = 'auth-delete';
    update public.admin_member_deletion_operations
    set actor_user_id = p_actor_user_id,
        target_user_id = p_target_user_id,
        status = 'pending',
        lease_token = v_lease_token,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        result = case
          when v_auth_delete_started
            then jsonb_build_object('stage', 'auth-delete', 'authDeleteStarted', true)
          else '{}'::jsonb
        end,
        updated_at = v_now,
        completed_at = null
    where operation_id = v_requested.operation_id;

    return jsonb_build_object(
      'state', 'claimed',
      'operationId', v_requested.operation_id,
      'leaseToken', v_lease_token,
      'resumed', true,
      'authDeleteStarted', v_auth_delete_started
    );
  end if;

  -- If Auth deletion may already have succeeded but the response was lost,
  -- a fresh browser operation id takes over the uncertain failed operation.
  select * into v_row
  from public.admin_member_deletion_operations
  where target_fingerprint = p_target_fingerprint
    and status = 'failed'
    and result ->> 'stage' = 'auth-delete'
  order by updated_at desc
  limit 1
  for update;

  if found then
    if v_row.target_email_fingerprint is distinct from p_target_email_fingerprint
    then
      return jsonb_build_object('state', 'conflict');
    end if;
    update public.admin_member_deletion_operations
    set actor_user_id = p_actor_user_id,
        target_user_id = p_target_user_id,
        status = 'pending',
        lease_token = v_lease_token,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        result = jsonb_build_object('stage', 'auth-delete', 'authDeleteStarted', true),
        updated_at = v_now,
        completed_at = null
    where operation_id = v_row.operation_id;

    return jsonb_build_object(
      'state', 'claimed',
      'operationId', v_row.operation_id,
      'leaseToken', v_lease_token,
      'resumed', true,
      'authDeleteStarted', true
    );
  end if;

  insert into public.admin_member_deletion_operations (
    operation_id,
    actor_user_id,
    target_user_id,
    target_fingerprint,
    target_email_fingerprint,
    status,
    lease_token,
    lease_expires_at,
    result,
    created_at,
    updated_at
  ) values (
    p_operation_id,
    p_actor_user_id,
    p_target_user_id,
    p_target_fingerprint,
    p_target_email_fingerprint,
    'pending',
    v_lease_token,
    v_now + make_interval(secs => p_lease_seconds),
    '{}'::jsonb,
    v_now,
    v_now
  );

  return jsonb_build_object(
    'state', 'claimed',
    'operationId', p_operation_id,
    'leaseToken', v_lease_token,
    'resumed', false,
    'authDeleteStarted', false
  );
end;
$$;

create or replace function public.renew_member_deletion_operation_v95(
  p_operation_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  p_lease_seconds := greatest(60, least(coalesce(p_lease_seconds, 600), 900));
  update public.admin_member_deletion_operations
  set lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      updated_at = v_now
  where operation_id = p_operation_id
    and status = 'pending'
    and lease_token = p_lease_token
    and lease_expires_at > v_now;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

-- Persist the point at which the non-transactional Auth delete has been sent.
-- From this point onward the row must remain pending until a worker reconciles
-- the Auth result; ordinary failure settlement is intentionally forbidden.
create or replace function public.mark_member_deletion_auth_started_v95(
  p_operation_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_count integer;
  v_target_fingerprint text;
  v_now timestamptz := clock_timestamp();
begin
  select target_fingerprint into v_target_fingerprint
  from public.admin_member_deletion_operations
  where operation_id = p_operation_id;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));

  update public.admin_member_deletion_operations
  set result = result || jsonb_build_object('stage', 'auth-delete', 'authDeleteStarted', true),
      updated_at = v_now
  where operation_id = p_operation_id
    and status = 'pending'
    and lease_token = p_lease_token
    and lease_expires_at > v_now;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

-- An uncertain Auth response releases the lease for immediate takeover but
-- deliberately keeps the target in the guarded pending/reconcile state.
create or replace function public.release_member_deletion_for_reconcile_v95(
  p_operation_id uuid,
  p_lease_token uuid,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_count integer;
  v_target_fingerprint text;
  v_now timestamptz := clock_timestamp();
begin
  select target_fingerprint into v_target_fingerprint
  from public.admin_member_deletion_operations
  where operation_id = p_operation_id;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));

  update public.admin_member_deletion_operations
  set result = result
        || coalesce(p_result, '{}'::jsonb)
        || jsonb_build_object('stage', 'auth-delete', 'authDeleteStarted', true),
      lease_expires_at = v_now,
      updated_at = v_now
  where operation_id = p_operation_id
    and status = 'pending'
    and lease_token = p_lease_token;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.complete_member_deletion_operation_v95(
  p_operation_id uuid,
  p_lease_token uuid,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_count integer;
  v_target_fingerprint text;
  v_now timestamptz := clock_timestamp();
begin
  select target_fingerprint into v_target_fingerprint
  from public.admin_member_deletion_operations
  where operation_id = p_operation_id;
  if not found then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));

  update public.admin_member_deletion_operations
  set status = 'completed',
      target_user_id = null,
      lease_token = null,
      lease_expires_at = null,
      result = coalesce(p_result, '{}'::jsonb),
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where operation_id = p_operation_id
    and status = 'pending'
    and lease_token = p_lease_token
    and lease_expires_at > v_now;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.fail_member_deletion_operation_v95(
  p_operation_id uuid,
  p_lease_token uuid,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_count integer;
  v_target_fingerprint text;
  v_now timestamptz := clock_timestamp();
begin
  select target_fingerprint into v_target_fingerprint
  from public.admin_member_deletion_operations
  where operation_id = p_operation_id;
  if not found then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));

  update public.admin_member_deletion_operations
  set status = 'failed',
      target_user_id = null,
      lease_token = null,
      lease_expires_at = null,
      result = coalesce(p_result, '{}'::jsonb),
      updated_at = clock_timestamp()
  where operation_id = p_operation_id
    and status = 'pending'
    and lease_token = p_lease_token
    and lease_expires_at > v_now
    and not (result @> '{"authDeleteStarted":true}'::jsonb)
    and not (coalesce(p_result, '{}'::jsonb) @> '{"authDeleteStarted":true}'::jsonb)
    and coalesce(p_result ->> 'stage', '') <> 'auth-delete';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

-- Delete email-bearing artifacts only while the caller still owns the live
-- deletion lease. Keeping identity validation, cleanup and fencing in one
-- transaction prevents a stale API worker from sweeping a newly reused email.
create or replace function public.cleanup_member_email_artifacts_v95(
  p_operation_id uuid,
  p_lease_token uuid,
  p_target_user_id uuid,
  p_target_email text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_normalized_email text;
  v_target_fingerprint text;
  v_target_email_fingerprint text;
  v_current_email_owner uuid;
begin
  if p_operation_id is null or p_lease_token is null or p_target_user_id is null then
    raise exception 'invalid member artifact cleanup identity' using errcode = '22023';
  end if;
  v_normalized_email := lower(trim(coalesce(p_target_email, '')));
  if v_normalized_email = '' then
    raise exception 'invalid member artifact cleanup email' using errcode = '22023';
  end if;

  v_target_fingerprint := encode(digest(lower(p_target_user_id::text), 'sha256'), 'hex');
  v_target_email_fingerprint := encode(digest(v_normalized_email, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_target_email_fingerprint, 0));
  if v_target_fingerprint <> v_target_email_fingerprint then
    perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));
  end if;

  perform 1
  from public.admin_member_deletion_operations as operation
  where operation.operation_id = p_operation_id
    and operation.status = 'pending'
    and operation.lease_token = p_lease_token
    and operation.lease_expires_at > v_now
    and operation.target_user_id = p_target_user_id
    and operation.target_fingerprint = v_target_fingerprint
    and operation.target_email_fingerprint = v_target_email_fingerprint
  for update;
  if not found then return 'lease_lost'; end if;

  select auth_user.id into v_current_email_owner
  from auth.users as auth_user
  where lower(trim(auth_user.email)) = v_normalized_email
  limit 1;

  if v_current_email_owner is not null
    and v_current_email_owner <> p_target_user_id
  then
    delete from public.password_reset_requests
    where target_user_id = p_target_user_id;

    update public.admin_audit_events
    set target_email = null
    where target_user_id = p_target_user_id;

    return 'email_reassigned';
  end if;

  delete from public.password_reset_requests
  where target_user_id = p_target_user_id
    or lower(trim(email)) = v_normalized_email;

  update public.admin_audit_events
  set target_email = null
  where target_user_id = p_target_user_id
    or lower(trim(target_email)) = v_normalized_email;

  return 'cleaned';
end;
$$;

revoke all on function public.claim_member_deletion_operation_v95(uuid, uuid, uuid, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.renew_member_deletion_operation_v95(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_member_deletion_auth_started_v95(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.release_member_deletion_for_reconcile_v95(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_member_deletion_operation_v95(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_member_deletion_operation_v95(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.cleanup_member_email_artifacts_v95(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_member_deletion_operation_v95(uuid, uuid, uuid, text, text, integer)
  to service_role;
grant execute on function public.renew_member_deletion_operation_v95(uuid, uuid, integer)
  to service_role;
grant execute on function public.mark_member_deletion_auth_started_v95(uuid, uuid)
  to service_role;
grant execute on function public.release_member_deletion_for_reconcile_v95(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.complete_member_deletion_operation_v95(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.fail_member_deletion_operation_v95(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.cleanup_member_email_artifacts_v95(uuid, uuid, uuid, text)
  to service_role;

create or replace function public.current_user_has_pending_member_deletion_v95()
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_fingerprint text;
begin
  if v_user_id is null then return false; end if;
  v_target_fingerprint := encode(digest(lower(v_user_id::text), 'sha256'), 'hex');
  -- The policy and the claim now serialize. An upload that starts first must
  -- commit before cleanup begins; an upload that starts second sees pending.
  perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));
  return exists (
    select 1
    from public.admin_member_deletion_operations as operation
    where (
        operation.target_user_id = v_user_id
        and operation.status = 'pending'
      )
      or (
        operation.target_fingerprint = v_target_fingerprint
        and operation.status = 'completed'
      )
  );
end;
$$;

revoke all on function public.current_user_has_pending_member_deletion_v95()
  from public, anon, authenticated, service_role;
grant execute on function public.current_user_has_pending_member_deletion_v95()
  to authenticated, service_role;

-- Admin grants and member deletion claims share the pending-deletion guard.
-- set_admin_access_v79 writes admin_users and admin_role_assignments in one
-- transaction, so rejecting the assignment rolls the entire grant back.
create or replace function public.prevent_admin_grant_during_member_deletion_v95()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_target_fingerprint text;
begin
  if new.is_active then
    v_target_fingerprint := encode(digest(lower(trim(new.user_id::text)), 'sha256'), 'hex');
    perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));
    if exists (
      select 1
      from public.admin_member_deletion_operations as operation
      where operation.target_user_id = new.user_id
        and operation.status = 'pending'
    ) then
      raise exception 'member deletion is in progress';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_role_assignment_deletion_guard_v95
  on public.admin_role_assignments;
create trigger admin_role_assignment_deletion_guard_v95
before insert or update of user_id, is_active
on public.admin_role_assignments
for each row
execute function public.prevent_admin_grant_during_member_deletion_v95();

revoke all on function public.prevent_admin_grant_during_member_deletion_v95()
  from public, anon, authenticated, service_role;

create or replace function public.prevent_admin_email_grant_during_member_deletion_v95()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_email_fingerprint text;
  v_target_user_id uuid;
  v_target_fingerprint text;
begin
  if new.is_active then
    v_email_fingerprint := encode(digest(lower(trim(new.email)), 'sha256'), 'hex');
    perform pg_advisory_xact_lock(hashtextextended(v_email_fingerprint, 0));

    select auth_user.id into v_target_user_id
    from auth.users as auth_user
    where lower(auth_user.email) = lower(trim(new.email))
    limit 1;
    if v_target_user_id is not null then
      v_target_fingerprint := encode(digest(lower(v_target_user_id::text), 'sha256'), 'hex');
      perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));
    end if;

    if exists (
      select 1
      from public.admin_member_deletion_operations as operation
      where (
          operation.target_email_fingerprint = v_email_fingerprint
          or operation.target_user_id = v_target_user_id
        )
        and operation.status = 'pending'
    ) then
      raise exception 'member deletion is in progress';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_user_deletion_guard_v95
  on public.admin_users;
create trigger admin_user_deletion_guard_v95
before insert or update of email, is_active
on public.admin_users
for each row
execute function public.prevent_admin_email_grant_during_member_deletion_v95();

revoke all on function public.prevent_admin_email_grant_during_member_deletion_v95()
  from public, anon, authenticated, service_role;

-- Keep the email fingerprint unavailable while deletion is pending. Inserts
-- and updates take the email lock before the user lock, matching the deletion
-- claim. This blocks both a target email change and reuse of the deleted email
-- by a new account until post-Auth cleanup has durably completed.
create or replace function public.prevent_auth_email_change_during_member_deletion_v95()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_target_fingerprint text;
  v_old_email_fingerprint text;
  v_new_email_fingerprint text;
begin
  if tg_op = 'INSERT' then
    if new.email is null then return new; end if;
    v_new_email_fingerprint := encode(digest(lower(trim(new.email)), 'sha256'), 'hex');
    perform pg_advisory_xact_lock(hashtextextended(v_new_email_fingerprint, 0));
    if exists (
      select 1
      from public.admin_member_deletion_operations as operation
      where operation.target_email_fingerprint = v_new_email_fingerprint
        and operation.status = 'pending'
    ) then
      raise exception 'member deletion is in progress';
    end if;
    return new;
  end if;

  if new.email is distinct from old.email then
    if old.email is not null then
      v_old_email_fingerprint := encode(digest(lower(trim(old.email)), 'sha256'), 'hex');
    end if;
    if new.email is not null then
      v_new_email_fingerprint := encode(digest(lower(trim(new.email)), 'sha256'), 'hex');
    end if;

    if v_old_email_fingerprint is not null and v_new_email_fingerprint is not null then
      perform pg_advisory_xact_lock(hashtextextended(least(v_old_email_fingerprint, v_new_email_fingerprint), 0));
      if v_old_email_fingerprint <> v_new_email_fingerprint then
        perform pg_advisory_xact_lock(hashtextextended(greatest(v_old_email_fingerprint, v_new_email_fingerprint), 0));
      end if;
    elsif v_old_email_fingerprint is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_old_email_fingerprint, 0));
    elsif v_new_email_fingerprint is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_new_email_fingerprint, 0));
    end if;

    v_target_fingerprint := encode(digest(lower(old.id::text), 'sha256'), 'hex');
    perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));
    if exists (
      select 1
      from public.admin_member_deletion_operations as operation
      where operation.status = 'pending'
        and (
          operation.target_user_id = old.id
          or (
            v_new_email_fingerprint is not null
            and operation.target_email_fingerprint = v_new_email_fingerprint
          )
        )
    ) then
      raise exception 'member deletion is in progress';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists auth_user_email_deletion_guard_v95 on auth.users;
create trigger auth_user_email_deletion_guard_v95
before insert or update of email
on auth.users
for each row
execute function public.prevent_auth_email_change_during_member_deletion_v95();

revoke all on function public.prevent_auth_email_change_during_member_deletion_v95()
  from public, anon, authenticated, service_role;

-- Password-reset throttle rows are personal data too. Admin-originated rows
-- carry the target Auth id so hard deletion cascades them, while this trigger
-- serializes late inserts with claim and blocks pending/completed tombstones.
create or replace function public.prevent_deleted_member_reset_record_v95()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_email_fingerprint text;
  v_target_fingerprint text;
begin
  v_email_fingerprint := encode(digest(lower(trim(new.email)), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_email_fingerprint, 0));
  if new.target_user_id is not null then
    v_target_fingerprint := encode(digest(lower(new.target_user_id::text), 'sha256'), 'hex');
    perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));
  end if;

  if exists (
    select 1
    from public.admin_member_deletion_operations as operation
    where (
        v_target_fingerprint is not null
        and operation.target_fingerprint = v_target_fingerprint
        and operation.status in ('pending', 'completed')
      )
      or (
        v_target_fingerprint is null
        and operation.target_email_fingerprint = v_email_fingerprint
        and operation.status in ('pending', 'completed')
      )
  ) then
    raise exception 'member deletion reset tombstone is active';
  end if;
  return new;
end;
$$;

drop trigger if exists password_reset_deletion_tombstone_v95
  on public.password_reset_requests;
create trigger password_reset_deletion_tombstone_v95
before insert or update of email, target_user_id
on public.password_reset_requests
for each row
execute function public.prevent_deleted_member_reset_record_v95();

revoke all on function public.prevent_deleted_member_reset_record_v95()
  from public, anon, authenticated, service_role;

-- Audit events remain for accountability, but a target email must never be
-- reintroduced after deletion claim. The trigger keeps the audit row and
-- forces its personal target field to NULL, including late concurrent writes.
create or replace function public.anonymize_deleted_member_audit_email_v95()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_email_fingerprint text;
  v_target_user_id uuid := new.target_user_id;
  v_target_fingerprint text;
begin
  if new.target_email is null then return new; end if;
  v_email_fingerprint := encode(digest(lower(trim(new.target_email)), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_email_fingerprint, 0));

  if v_target_user_id is null then
    select auth_user.id into v_target_user_id
    from auth.users as auth_user
    where lower(auth_user.email) = lower(trim(new.target_email))
    limit 1;
  end if;
  if v_target_user_id is not null then
    v_target_fingerprint := encode(digest(lower(v_target_user_id::text), 'sha256'), 'hex');
    perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));
  end if;

  if exists (
    select 1
    from public.admin_member_deletion_operations as operation
    where (
        v_target_fingerprint is not null
        and operation.target_fingerprint = v_target_fingerprint
        and operation.status in ('pending', 'completed')
      )
      or (
        v_target_fingerprint is null
        and operation.target_email_fingerprint = v_email_fingerprint
        and operation.status in ('pending', 'completed')
      )
  ) then
    new.target_email := null;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_audit_deletion_anonymizer_v95
  on public.admin_audit_events;
create trigger admin_audit_deletion_anonymizer_v95
before insert or update of target_user_id, target_email
on public.admin_audit_events
for each row
execute function public.anonymize_deleted_member_audit_email_v95();

revoke all on function public.anonymize_deleted_member_audit_email_v95()
  from public, anon, authenticated, service_role;

-- Supabase Storage separates the RLS permission check from the later
-- superuser metadata upsert. This trigger fences that final commit as well:
-- an upload finishing after claim/completion is rejected, causing Storage's
-- uploader error path to delete the just-uploaded object version.
create or replace function public.prevent_deleted_member_avatar_commit_v95()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, storage, extensions
as $$
declare
  v_owner_segment text;
  v_target_fingerprint text;
begin
  if new.bucket_id <> 'leaderboard-avatars' then return new; end if;
  v_owner_segment := (storage.foldername(new.name))[1];
  if v_owner_segment is null
     or v_owner_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return new;
  end if;

  v_target_fingerprint := encode(digest(lower(v_owner_segment), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_target_fingerprint, 0));
  if exists (
    select 1
    from public.admin_member_deletion_operations as operation
    where operation.target_fingerprint = v_target_fingerprint
      and operation.status in ('pending', 'completed')
  ) then
    raise exception 'member deletion storage tombstone is active';
  end if;
  return new;
end;
$$;

drop trigger if exists member_avatar_deletion_tombstone_v95 on storage.objects;
create trigger member_avatar_deletion_tombstone_v95
before insert or update
on storage.objects
for each row
execute function public.prevent_deleted_member_avatar_commit_v95();

revoke all on function public.prevent_deleted_member_avatar_commit_v95()
  from public, anon, authenticated, service_role;

-- Signed JWTs can remain cryptographically valid after sign-out or account
-- deletion. High-risk server actions and Storage writes must also prove that
-- the backing Auth session still exists and has not expired.
create or replace function public.verify_active_aal2_session_v95(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select exists (
    select 1
    from auth.sessions as session
    where session.id = p_session_id
      and session.user_id = p_user_id
      and session.aal::text = 'aal2'
      and (session.not_after is null or session.not_after > now())
  );
$$;

revoke all on function public.verify_active_aal2_session_v95(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.verify_active_aal2_session_v95(uuid, uuid)
  to service_role;

create or replace function public.current_auth_session_is_active_v95()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select exists (
    select 1
    from auth.sessions as session
    where session.id::text = (auth.jwt() ->> 'session_id')
      and session.user_id = auth.uid()
      and (session.not_after is null or session.not_after > now())
  );
$$;

revoke all on function public.current_auth_session_is_active_v95()
  from public, anon, authenticated, service_role;
grant execute on function public.current_auth_session_is_active_v95()
  to authenticated, service_role;

drop policy if exists "Users can upload own leaderboard avatar" on storage.objects;
create policy "Users can upload own leaderboard avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'leaderboard-avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
    and (select public.current_auth_session_is_active_v95())
    and not (select public.current_user_has_pending_member_deletion_v95())
  );

drop policy if exists "Users can update own leaderboard avatar" on storage.objects;
create policy "Users can update own leaderboard avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'leaderboard-avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
    and (select public.current_auth_session_is_active_v95())
    and not (select public.current_user_has_pending_member_deletion_v95())
  )
  with check (
    bucket_id = 'leaderboard-avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
    and (select public.current_auth_session_is_active_v95())
    and not (select public.current_user_has_pending_member_deletion_v95())
  );

drop policy if exists "Users can delete own leaderboard avatar" on storage.objects;
create policy "Users can delete own leaderboard avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'leaderboard-avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
    and (select public.current_auth_session_is_active_v95())
    and not (select public.current_user_has_pending_member_deletion_v95())
  );

-- Existing users can be grouped immediately from the entitlement provenance
-- that was already stored before this ledger existed.
with historical_redemptions as (
  select
    activation_code.id as activation_code_id,
    entitlement.user_id,
    entitlement.exam_id,
    coalesce(entitlement.granted_at, activation_code.redeemed_at, activation_code.created_at, now()) as redeemed_at
  from public.user_exam_entitlements as entitlement
  join public.activation_codes as activation_code
    on activation_code.code_hash = entitlement.source_code_hash
   and activation_code.exam_id = entitlement.exam_id
  where entitlement.source_code_hash is not null

  union

  select
    activation_code.id,
    entitlement.user_id,
    'senior-securities',
    coalesce(entitlement.granted_at, activation_code.redeemed_at, activation_code.created_at, now())
  from public.user_entitlements as entitlement
  join public.activation_codes as activation_code
    on activation_code.code_hash = entitlement.source_code_hash
   and activation_code.exam_id = 'senior-securities'
  where entitlement.source_code_hash is not null

  union

  select
    activation_code.id,
    activation_code.redeemed_by,
    activation_code.exam_id,
    coalesce(activation_code.redeemed_at, activation_code.created_at, now())
  from public.activation_codes as activation_code
  where activation_code.redeemed_by is not null
)
insert into public.activation_code_redemptions (
  activation_code_id,
  user_id,
  exam_id,
  redeemed_at,
  source
)
select
  historical_redemptions.activation_code_id,
  historical_redemptions.user_id,
  historical_redemptions.exam_id,
  min(historical_redemptions.redeemed_at),
  'legacy_entitlement'
from historical_redemptions
where historical_redemptions.user_id is not null
group by historical_redemptions.activation_code_id, historical_redemptions.user_id, historical_redemptions.exam_id
on conflict (activation_code_id, user_id) do nothing;

-- Some pre-ledger uses cannot be attributed to a current user because the old
-- schema kept only the first redeemer and each user's most recent source code.
-- Preserve that gap explicitly instead of presenting reconstructed history as
-- complete. New redemptions always have a ledger row, so this value is stable.
update public.activation_codes as activation_code
set redemption_history_gap = greatest(
  activation_code.use_count - (
    select count(*)::integer
    from public.activation_code_redemptions as redemption
    where redemption.activation_code_id = activation_code.id
  ),
  0
);

create or replace function private.redeem_activation_code_v95(
  p_code text,
  p_expected_exam_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := public.normalize_activation_code(p_code);
  normalized_exam_id text := nullif(lower(trim(coalesce(p_expected_exam_id, ''))), '');
  code_record public.activation_codes%rowtype;
begin
  if current_user_id is null then
    raise exception '請先登入後再輸入啟用碼。';
  end if;

  if normalized_exam_id is not null
     and normalized_exam_id not in ('senior-securities', 'junior-foreign-exchange') then
    raise exception '題庫種類不正確。';
  end if;

  if normalized_code is null or length(normalized_code) < 10 then
    raise exception '啟用碼格式不正確。';
  end if;

  select activation_code.*
    into code_record
    from public.activation_codes as activation_code
   where activation_code.code_hash = public.activation_code_hash(normalized_code)
     and (normalized_exam_id is null or activation_code.exam_id = normalized_exam_id)
   for update;

  if not found then
    raise exception '啟用碼不適用於此題庫，或不存在。';
  end if;

  if not code_record.is_active then
    raise exception '啟用碼已停用。';
  end if;

  if exists (
    select 1
      from public.activation_code_redemptions as redemption
     where redemption.activation_code_id = code_record.id
       and redemption.user_id = current_user_id
       and redemption.exam_id = code_record.exam_id
  ) then
    raise exception '這個帳號已使用過此啟用碼。';
  end if;

  if exists (
    select 1
      from public.user_exam_entitlements as entitlement
     where entitlement.user_id = current_user_id
       and entitlement.exam_id = code_record.exam_id
       and entitlement.status = 'active'
       and (entitlement.expires_at is null or entitlement.expires_at > now())
  ) then
    raise exception '這個帳號已開通此題庫，不會再次消耗啟用碼。';
  end if;

  if code_record.use_count >= code_record.max_uses then
    raise exception '啟用碼已用完。';
  end if;

  insert into public.activation_code_redemptions (
    activation_code_id,
    user_id,
    exam_id,
    redeemed_at,
    source
  ) values (
    code_record.id,
    current_user_id,
    code_record.exam_id,
    now(),
    'redeem'
  );

  update public.activation_codes
     set use_count = use_count + 1,
         redeemed_by = coalesce(redeemed_by, current_user_id),
         redeemed_at = coalesce(redeemed_at, now())
   where id = code_record.id;

  insert into public.user_exam_entitlements (
    user_id,
    exam_id,
    plan,
    status,
    source_code_hash,
    granted_at,
    expires_at
  ) values (
    current_user_id,
    code_record.exam_id,
    'full',
    'active',
    code_record.code_hash,
    now(),
    null
  )
  on conflict (user_id, exam_id) do update
  set plan = 'full',
      status = 'active',
      source_code_hash = excluded.source_code_hash,
      granted_at = now(),
      expires_at = null;

  if code_record.exam_id = 'senior-securities' then
    insert into public.user_entitlements (
      user_id,
      plan,
      status,
      source_code_hash,
      granted_at,
      expires_at
    ) values (
      current_user_id,
      'full',
      'active',
      code_record.code_hash,
      now(),
      null
    )
    on conflict (user_id) do update
    set plan = 'full',
        status = 'active',
        source_code_hash = excluded.source_code_hash,
        granted_at = now(),
        expires_at = null;
  end if;

  return true;
end;
$$;

revoke all on function private.redeem_activation_code_v95(text, text)
  from public, anon, authenticated, service_role;

-- Keep both the current exam-scoped RPC and the rolling-compatibility RPC.
-- They share the same locked, duplicate-safe implementation.
create or replace function public.redeem_exam_activation_code_v94(
  p_code text,
  p_expected_exam_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if nullif(lower(trim(coalesce(p_expected_exam_id, ''))), '') is null then
    raise exception '題庫種類不正確。';
  end if;
  return private.redeem_activation_code_v95(p_code, p_expected_exam_id);
end;
$$;

create or replace function public.redeem_activation_code(p_code text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.redeem_activation_code_v95(p_code, null);
$$;

revoke all on function public.redeem_exam_activation_code_v94(text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_exam_activation_code_v94(text, text)
  to authenticated, service_role;

revoke all on function public.redeem_activation_code(text)
  from public, anon, authenticated;
grant execute on function public.redeem_activation_code(text)
  to authenticated, service_role;

-- Used codes are provenance records and can only be disabled, never erased.
-- Keep permanent deletion available for unused mistakes/test codes.
create or replace function public.delete_activation_code_v79(
  p_actor_user_id uuid,
  p_actor_email text,
  p_activation_code_id uuid,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.activation_codes%rowtype;
begin
  select * into target from public.activation_codes where id = p_activation_code_id for update;
  if target.id is null then raise exception 'activation code not found'; end if;
  if target.use_count > 0 or exists (
    select 1 from public.activation_code_redemptions where activation_code_id = target.id
  ) then
    raise exception 'used activation codes must be disabled instead of deleted';
  end if;
  delete from public.activation_codes where id = p_activation_code_id;
  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    lower(trim(p_actor_email)),
    'activation_code.delete',
    jsonb_build_object('activationCodeId', target.id, 'codePreview', target.code_preview, 'useCount', 0, 'maxUses', target.max_uses),
    p_ip_address
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_activation_code_v79(uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.delete_activation_code_v79(uuid,text,uuid,text)
  to service_role;

create or replace function public.set_activation_code_status_v95(
  p_actor_user_id uuid,
  p_actor_email text,
  p_activation_code_id uuid,
  p_is_active boolean,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.activation_codes%rowtype;
begin
  if p_is_active is null then raise exception 'activation code status is required'; end if;
  select * into target from public.activation_codes where id = p_activation_code_id for update;
  if target.id is null then raise exception 'activation code not found'; end if;
  update public.activation_codes set is_active = p_is_active where id = target.id;
  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    lower(trim(p_actor_email)),
    'activation_code.status_update',
    jsonb_build_object(
      'activationCodeId', target.id,
      'codePreview', target.code_preview,
      'fromActive', target.is_active,
      'toActive', p_is_active
    ),
    p_ip_address
  );
  return jsonb_build_object('ok', true, 'isActive', p_is_active);
end;
$$;

revoke all on function public.set_activation_code_status_v95(uuid,text,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.set_activation_code_status_v95(uuid,text,uuid,boolean,text)
  to service_role;

select pg_notify('pgrst', 'reload schema');
