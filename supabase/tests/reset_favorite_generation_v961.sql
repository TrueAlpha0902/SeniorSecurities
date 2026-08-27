begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
) values (
  '96100000-0000-4000-8000-000000000001'::uuid,
  'authenticated', 'authenticated', 'v961-reset-test@example.invalid',
  'not-a-real-password', now(), '{}'::jsonb, '{}'::jsonb, now(), now(), false, false
);
select set_config('request.jwt.claim.sub', '96100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $test$
begin
  if has_table_privilege('authenticated', 'public.user_favorite_records', 'DELETE')
     or has_table_privilege('anon', 'public.user_favorite_records', 'DELETE')
     or has_table_privilege('public', 'public.user_favorite_records', 'DELETE')
     or has_table_privilege('authenticated', 'public.user_record_tombstones', 'DELETE')
     or not has_function_privilege(
       'authenticated',
       'public.delete_user_learning_records_v961(text,text,bigint,text,text[],boolean)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.clear_user_record_tombstones_v961(text,text[])',
       'EXECUTE'
     ) then
    raise exception 'destructive write privileges are not fail-closed through v96.1 RPC';
  end if;
end;
$test$;

insert into public.user_favorite_records (
  user_id, question_id, bank_id, chapter, exam_id, reset_generation
) values (
  auth.uid(), 'financial-analysis-ch01-pdf-0001', 'financial-analysis', 'ch01',
  'senior-securities', 0
);

do $test$
declare
  complete_result jsonb;
  restart_result jsonb;
begin
  complete_result := public.reset_learning_data_v96(
    'senior-securities', 'complete',
    '96100000-0000-4000-8000-000000000101'::uuid
  );
  if (complete_result->>'securitiesFavoriteGeneration')::bigint <> 1 then
    raise exception 'complete did not increment favorite generation';
  end if;
  restart_result := public.reset_learning_data_v96(
    'senior-securities', 'restart',
    '96100000-0000-4000-8000-000000000102'::uuid
  );
  if (restart_result->>'securitiesGeneration')::bigint <> 2
     or (restart_result->>'securitiesWrongGeneration')::bigint <> 2
     or (restart_result->>'securitiesFavoriteGeneration')::bigint <> 1 then
    raise exception 'complete -> restart generations are incorrect';
  end if;
  if exists (
    select 1 from public.user_favorite_records where user_id = auth.uid()
  ) then
    raise exception 'complete favorite was resurrected by restart';
  end if;
end;
$test$;

do $test$
begin
  begin
    insert into public.user_favorite_records (
      user_id, question_id, bank_id, chapter, exam_id, reset_generation
    ) values (
      auth.uid(), 'financial-analysis-ch01-pdf-0001', 'financial-analysis', 'ch01',
      'senior-securities', 0
    );
    raise exception 'stale favorite generation was accepted' using errcode = 'Z0001';
  exception
    when sqlstate 'P0001' then null;
  end;
end;
$test$;

insert into public.user_favorite_records (
  user_id, question_id, bank_id, chapter, exam_id, reset_generation
) values (
  auth.uid(), 'financial-analysis-ch01-pdf-0001', 'financial-analysis', 'ch01',
  'senior-securities', 1
);

select public.reset_learning_data_v96(
  'senior-securities', 'restart',
  '96100000-0000-4000-8000-000000000103'::uuid
);

do $test$
begin
  if not exists (
    select 1 from public.user_favorite_records
    where user_id = auth.uid()
      and question_id = 'financial-analysis-ch01-pdf-0001'
      and reset_generation = 1
  ) then
    raise exception 'restart did not preserve current favorite generation';
  end if;
end;
$test$;

select public.delete_user_learning_records_v961(
  'delete-op-v961-1',
  'senior-securities',
  1,
  'user_favorite_records',
  array['financial-analysis-ch01-pdf-0001'],
  false
);

select public.clear_user_record_tombstones_v961(
  'favorite', array['financial-analysis-ch01-pdf-0001']
);

do $test$
begin
  if exists (
    select 1 from public.user_favorite_records
    where user_id = auth.uid()
      and question_id = 'financial-analysis-ch01-pdf-0001'
  ) then
    raise exception 'atomic delete did not remove favorite';
  end if;
  if not exists (
    select 1 from public.user_record_tombstones
    where user_id = auth.uid()
      and record_type = 'favorite'
      and record_key = 'financial-analysis-ch01-pdf-0001'
  ) then
    raise exception 'atomic delete did not create tombstone';
  end if;
end;
$test$;

insert into public.user_favorite_records (
  user_id, question_id, bank_id, chapter, exam_id, reset_generation
) values (
  auth.uid(), 'financial-analysis-ch01-pdf-0001', 'financial-analysis', 'ch01',
  'senior-securities', 1
);

select public.clear_user_record_tombstones_v961(
  'favorite', array['financial-analysis-ch01-pdf-0001']
);

do $test$
begin
  if exists (
    select 1 from public.user_record_tombstones
    where user_id = auth.uid()
      and record_type = 'favorite'
      and record_key = 'financial-analysis-ch01-pdf-0001'
  ) then
    raise exception 'newer live favorite did not clear its older tombstone';
  end if;
end;
$test$;

select public.delete_user_learning_records_v961(
  'delete-op-v961-1',
  'senior-securities',
  1,
  'user_favorite_records',
  array['financial-analysis-ch01-pdf-0001'],
  false
);

do $test$
begin
  if not exists (
    select 1 from public.user_favorite_records
    where user_id = auth.uid()
      and question_id = 'financial-analysis-ch01-pdf-0001'
  ) then
    raise exception 'operation replay deleted a new same-generation favorite';
  end if;
  begin
    perform public.delete_user_learning_records_v961(
      'delete-op-v961-1',
      'senior-securities',
      1,
      'user_favorite_records',
      array['financial-analysis-ch01-pdf-0002'],
      false
    );
    raise exception 'operation id reuse with different keys was accepted';
  exception
    when others then
      if sqlerrm = 'operation id reuse with different keys was accepted' then raise; end if;
  end;
end;
$test$;

insert into public.user_favorite_records (
  user_id, question_id, bank_id, chapter, exam_id, reset_generation
) values (
  auth.uid(), 'financial-analysis-ch01-pdf-0002', 'financial-analysis', 'ch01',
  'senior-securities', 1
);

select public.delete_user_learning_records_v961(
  'clear-op-v961-2',
  'senior-securities',
  1,
  'user_favorite_records',
  array[]::text[],
  true
);

do $test$
begin
  if exists (
    select 1 from public.user_favorite_records where user_id = auth.uid()
  ) then
    raise exception 'atomic clear did not remove all current-generation favorites';
  end if;
  if (
    select count(*) from public.user_record_tombstones
    where user_id = auth.uid() and record_type = 'favorite'
  ) < 2 then
    raise exception 'atomic clear did not create all favorite tombstones';
  end if;
  begin
    perform public.delete_user_learning_records_v961(
      'stale-op-v961-3',
      'senior-securities',
      0,
      'user_favorite_records',
      array['financial-analysis-ch01-pdf-0003'],
      false
    );
    raise exception 'stale destructive generation was accepted' using errcode = 'Z0002';
  exception
    when sqlstate 'P0001' then null;
  end;
end;
$test$;

rollback;
select 'v961_semantics_passed' as result;
