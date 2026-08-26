-- Redeem an activation code only when it belongs to the question bank that
-- the learner is currently activating. Keep redeem_activation_code(text)
-- temporarily for rolling compatibility with already-installed PWA clients.

create or replace function public.redeem_exam_activation_code_v94(
  p_code text,
  p_expected_exam_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := public.normalize_activation_code(p_code);
  normalized_exam_id text := lower(trim(coalesce(p_expected_exam_id, '')));
  code_record public.activation_codes%rowtype;
begin
  if current_user_id is null then
    raise exception '請先登入後再輸入啟用碼。';
  end if;

  if normalized_exam_id not in ('senior-securities', 'junior-foreign-exchange') then
    raise exception '題庫種類不正確。';
  end if;

  if normalized_code is null or length(normalized_code) < 10 then
    raise exception '啟用碼格式不正確。';
  end if;

  update public.activation_codes
  set
    use_count = use_count + 1,
    redeemed_by = coalesce(redeemed_by, current_user_id),
    redeemed_at = coalesce(redeemed_at, now())
  where code_hash = public.activation_code_hash(normalized_code)
    and exam_id = normalized_exam_id
    and is_active = true
    and use_count < max_uses
  returning * into code_record;

  if not found then
    raise exception '啟用碼不適用於此題庫，或不存在、已用完或已停用。';
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

revoke all on function public.redeem_exam_activation_code_v94(text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_exam_activation_code_v94(text, text)
  to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
