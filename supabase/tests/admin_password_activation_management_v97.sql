begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
) values
  (
    '97000000-0000-4000-8000-000000000001'::uuid,
    'authenticated', 'authenticated', 'v97-actor@example.invalid',
    'not-a-real-password', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), false, false
  ),
  (
    '97000000-0000-4000-8000-000000000002'::uuid,
    'authenticated', 'authenticated', 'v97-member@example.invalid',
    'not-a-real-password', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), false, false
  ),
  (
    '97000000-0000-4000-8000-000000000003'::uuid,
    'authenticated', 'authenticated', 'v97-entitled@example.invalid',
    'not-a-real-password', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), false, false
  );

select public.create_activation_code_v97(
  '97000000-0000-4000-8000-000000000001'::uuid,
  'v97-actor@example.invalid',
  public.activation_code_hash(public.normalize_activation_code('ALLBANKTESTA1')),
  'ALLBAN...STA1',
  2,
  'v97 all-scope test',
  true,
  'all',
  null
);

select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select public.redeem_exam_activation_code_v94('ALLBANKTESTA1', 'senior-securities');

do $test$
begin
  begin
    perform public.redeem_exam_activation_code_v94('ALLBANKTESTA1', 'junior-foreign-exchange');
    raise exception 'same account consumed an all-scope code twice' using errcode = 'Z0001';
  exception
    when sqlstate 'P0001' then null;
  end;
end;
$test$;

reset role;

do $test$
declare
  target_code_id uuid;
begin
  select id into target_code_id
  from public.activation_codes
  where code_hash = public.activation_code_hash(public.normalize_activation_code('ALLBANKTESTA1'));

  if (
    select count(*)
    from public.user_exam_entitlements
    where user_id = '97000000-0000-4000-8000-000000000002'::uuid
      and exam_id in ('senior-securities', 'junior-foreign-exchange')
      and status = 'active'
  ) <> 2 then
    raise exception 'all-scope redemption did not grant both question banks';
  end if;

  if (select use_count from public.activation_codes where id = target_code_id) <> 1 then
    raise exception 'all-scope redemption consumed more than one use';
  end if;

  if (
    select count(*)
    from public.activation_code_redemptions
    where activation_code_id = target_code_id
      and user_id = '97000000-0000-4000-8000-000000000002'::uuid
      and exam_id = 'all'
  ) <> 1 then
    raise exception 'all-scope redemption ledger is incorrect';
  end if;
end;
$test$;

insert into public.user_exam_entitlements(user_id, exam_id, plan, status, granted_at)
values
  ('97000000-0000-4000-8000-000000000003'::uuid, 'senior-securities', 'full', 'active', now()),
  ('97000000-0000-4000-8000-000000000003'::uuid, 'junior-foreign-exchange', 'full', 'active', now())
on conflict (user_id, exam_id) do update set status = 'active', expires_at = null;

select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $test$
begin
  begin
    perform public.redeem_exam_activation_code_v94('ALLBANKTESTA1', 'junior-foreign-exchange');
    raise exception 'already-entitled account consumed an all-scope code' using errcode = 'Z0002';
  exception
    when sqlstate 'P0001' then null;
  end;
end;
$test$;

reset role;

do $test$
declare
  target_code_id uuid;
  deletion_result jsonb;
begin
  select id into target_code_id
  from public.activation_codes
  where code_hash = public.activation_code_hash(public.normalize_activation_code('ALLBANKTESTA1'));

  deletion_result := public.delete_activation_code_v97(
    '97000000-0000-4000-8000-000000000001'::uuid,
    'v97-actor@example.invalid',
    target_code_id,
    null
  );

  if deletion_result->>'mode' <> 'archived'
     or not exists (
       select 1 from public.activation_codes
       where id = target_code_id and deleted_at is not null and is_active = false
     ) then
    raise exception 'used activation code was not safely archived';
  end if;

  if (
    select count(*)
    from public.user_exam_entitlements
    where user_id = '97000000-0000-4000-8000-000000000002'::uuid
      and status = 'active'
  ) <> 2 then
    raise exception 'archiving a used code revoked existing entitlements';
  end if;

  begin
    perform public.set_activation_code_status_v97(
      '97000000-0000-4000-8000-000000000001'::uuid,
      'v97-actor@example.invalid',
      target_code_id,
      true,
      null
    );
    raise exception 'deleted activation code was restored' using errcode = 'Z0003';
  exception
    when sqlstate 'P0001' then null;
  end;
end;
$test$;

insert into auth.sessions(id, user_id, created_at, updated_at, aal, not_after)
values (
  '97000000-0000-4000-8000-000000000010'::uuid,
  '97000000-0000-4000-8000-000000000001'::uuid,
  now(), now(), 'aal1', now() + interval '1 hour'
);
insert into auth.mfa_amr_claims(session_id, created_at, updated_at, authentication_method, id)
values (
  '97000000-0000-4000-8000-000000000010'::uuid,
  now(), now(), 'password', '97000000-0000-4000-8000-000000000011'::uuid
);

do $test$
begin
  if not public.verify_active_recent_password_session_v97(
    '97000000-0000-4000-8000-000000000001'::uuid,
    '97000000-0000-4000-8000-000000000010'::uuid,
    600
  ) then
    raise exception 'recent password session was rejected';
  end if;

  update auth.mfa_amr_claims
  set created_at = now() - interval '20 minutes'
  where session_id = '97000000-0000-4000-8000-000000000010'::uuid;

  if public.verify_active_recent_password_session_v97(
    '97000000-0000-4000-8000-000000000001'::uuid,
    '97000000-0000-4000-8000-000000000010'::uuid,
    600
  ) then
    raise exception 'stale password session was accepted';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.create_activation_code_v97(uuid,text,text,text,integer,text,boolean,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.delete_activation_code_v97(uuid,text,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.verify_active_recent_password_session_v97(uuid,uuid,integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.redeem_exam_activation_code_v94(text,text)',
    'EXECUTE'
  ) then
    raise exception 'v97 function privileges are not least-privilege';
  end if;
end;
$test$;

rollback;
select 'admin_password_activation_management_v97_semantics_passed' as result;
