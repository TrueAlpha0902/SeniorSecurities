-- v91.2.2: idempotent repair for exam-scoped question-bank access.
-- Replays the v80 entitlement schema, legacy backfill, RLS grants, and
-- activation-code functions so an incomplete Production migration can recover.

do $$
begin
  if to_regclass('public.activation_codes') is null then
    raise exception 'Base activation_codes table is missing; apply earlier project migrations first.';
  end if;
  if to_regclass('public.user_entitlements') is null then
    raise exception 'Base user_entitlements table is missing; apply earlier project migrations first.';
  end if;
end $$;

alter table if exists public.activation_codes
  add column if not exists exam_id text;

update public.activation_codes
set exam_id = 'senior-securities'
where exam_id is null or trim(exam_id) = '';

alter table if exists public.activation_codes
  alter column exam_id set default 'senior-securities';

alter table if exists public.activation_codes
  alter column exam_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.activation_codes'::regclass
      and conname = 'activation_codes_exam_id_check'
  ) then
    alter table public.activation_codes
      add constraint activation_codes_exam_id_check
      check (exam_id in ('senior-securities', 'junior-foreign-exchange'));
  end if;
end $$;

create index if not exists activation_codes_exam_created_idx
  on public.activation_codes(exam_id, created_at desc);

create table if not exists public.user_exam_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id text not null check (exam_id in ('senior-securities', 'junior-foreign-exchange')),
  plan text not null default 'full',
  status text not null default 'active' check (status in ('active', 'revoked')),
  source_code_hash text references public.activation_codes(code_hash) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, exam_id)
);

create index if not exists user_exam_entitlements_exam_status_idx
  on public.user_exam_entitlements(exam_id, status, granted_at desc);

insert into public.user_exam_entitlements (
  user_id,
  exam_id,
  plan,
  status,
  source_code_hash,
  granted_at,
  expires_at
)
select
  user_id,
  'senior-securities',
  plan,
  status,
  source_code_hash,
  granted_at,
  expires_at
from public.user_entitlements
on conflict (user_id, exam_id) do update
set
  plan = excluded.plan,
  status = excluded.status,
  source_code_hash = excluded.source_code_hash,
  granted_at = excluded.granted_at,
  expires_at = excluded.expires_at;

alter table public.user_exam_entitlements enable row level security;

drop policy if exists "Users can read their own exam entitlements" on public.user_exam_entitlements;
create policy "Users can read their own exam entitlements"
  on public.user_exam_entitlements
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.user_exam_entitlements from public, anon;
grant select on table public.user_exam_entitlements to authenticated;
grant all on table public.user_exam_entitlements to service_role;

create or replace function public.redeem_activation_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := public.normalize_activation_code(p_code);
  code_record public.activation_codes%rowtype;
begin
  if current_user_id is null then
    raise exception '請先登入後再輸入啟用碼。';
  end if;

  if length(normalized_code) < 10 then
    raise exception '啟用碼格式不正確。';
  end if;

  update public.activation_codes
  set
    use_count = use_count + 1,
    redeemed_by = coalesce(redeemed_by, current_user_id),
    redeemed_at = coalesce(redeemed_at, now())
  where code_hash = public.activation_code_hash(normalized_code)
    and is_active = true
    and use_count < max_uses
  returning * into code_record;

  if not found then
    raise exception '啟用碼不存在、已使用或已停用。';
  end if;

  insert into public.user_exam_entitlements (
    user_id,
    exam_id,
    plan,
    status,
    source_code_hash,
    granted_at,
    expires_at
  )
  values (
    current_user_id,
    code_record.exam_id,
    'full',
    'active',
    code_record.code_hash,
    now(),
    null
  )
  on conflict (user_id, exam_id) do update
  set
    plan = 'full',
    status = 'active',
    source_code_hash = excluded.source_code_hash,
    granted_at = now(),
    expires_at = null;

  -- Keep the legacy securities entitlement in sync while older clients remain deployed.
  if code_record.exam_id = 'senior-securities' then
    insert into public.user_entitlements (
      user_id,
      plan,
      status,
      source_code_hash,
      granted_at,
      expires_at
    )
    values (
      current_user_id,
      'full',
      'active',
      code_record.code_hash,
      now(),
      null
    )
    on conflict (user_id) do update
    set
      plan = 'full',
      status = 'active',
      source_code_hash = excluded.source_code_hash,
      granted_at = now(),
      expires_at = null;
  end if;

  return true;
end;
$$;

revoke all on function public.redeem_activation_code(text) from public, anon;
grant execute on function public.redeem_activation_code(text) to authenticated, service_role;

create or replace function public.create_activation_code_v80(
  p_actor_user_id uuid,
  p_actor_email text,
  p_code_hash text,
  p_code_preview text,
  p_max_uses integer,
  p_note text,
  p_custom_code boolean,
  p_exam_id text,
  p_ip_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_id uuid;
  normalized_exam_id text := lower(trim(p_exam_id));
begin
  if p_actor_user_id is null then raise exception 'invalid actor'; end if;
  if p_max_uses < 1 or p_max_uses > 999 then raise exception 'invalid max uses'; end if;
  if normalized_exam_id not in ('senior-securities', 'junior-foreign-exchange') then
    raise exception 'invalid exam id';
  end if;

  insert into public.activation_codes(code_hash, code_preview, max_uses, note, exam_id)
  values (p_code_hash, p_code_preview, p_max_uses, nullif(trim(p_note), ''), normalized_exam_id)
  returning id into created_id;

  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    lower(trim(p_actor_email)),
    'activation_code.create',
    jsonb_build_object(
      'activationCodeId', created_id,
      'examId', normalized_exam_id,
      'maxUses', p_max_uses,
      'hasNote', nullif(trim(p_note), '') is not null,
      'customCode', p_custom_code
    ),
    p_ip_address
  );

  return created_id;
end;
$$;

revoke all on function public.create_activation_code_v80(uuid,text,text,text,integer,text,boolean,text,text)
  from public, anon, authenticated;
grant execute on function public.create_activation_code_v80(uuid,text,text,text,integer,text,boolean,text,text)
  to service_role;

select pg_notify('pgrst', 'reload schema');
