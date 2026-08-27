-- SeniorSecurities v96.1
-- Separates favorite resets from ordinary learning resets and makes destructive
-- record sync plus tombstone creation one idempotent database transaction.

-- Fail closed if the migration runner does not provide one transaction. This
-- lock also serializes the ledger backfill with any in-flight v96 reset.
lock table public.user_learning_reset_state in access exclusive mode;
lock table public.user_learning_reset_requests in share row exclusive mode;

alter table public.user_learning_reset_state
  add column if not exists favorite_generation bigint not null default 0;

alter table public.user_learning_reset_state
  drop constraint if exists user_learning_reset_state_favorite_generation_check;
alter table public.user_learning_reset_state
  add constraint user_learning_reset_state_favorite_generation_check
  check (favorite_generation >= 0);

-- Reconstruct the favorite epoch from the append-only reset request ledger so
-- complete -> restart cannot be mistaken for a restart-only history.
update public.user_learning_reset_state state
set favorite_generation = coalesce((
  select count(*)::bigint
  from public.user_learning_reset_requests requests
  where requests.user_id = state.user_id
    and requests.mode = 'complete'
    and requests.scope in (state.exam_id, 'all')
), 0);

create or replace function public.get_learning_reset_state_v96(
  p_exam_id text default 'senior-securities'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_exam_id text := lower(trim(coalesce(p_exam_id, '')));
  current_state public.user_learning_reset_state%rowtype;
begin
  if current_user_id is null then raise exception '請先登入。'; end if;
  if normalized_exam_id not in ('senior-securities', 'junior-foreign-exchange') then
    raise exception 'invalid exam_id';
  end if;
  select * into current_state
  from public.user_learning_reset_state state
  where state.user_id = current_user_id
    and state.exam_id = normalized_exam_id;
  return jsonb_build_object(
    'examId', normalized_exam_id,
    'generation', coalesce(current_state.data_generation, 0),
    'dataGeneration', coalesce(current_state.data_generation, 0),
    'wrongGeneration', coalesce(current_state.wrong_generation, 0),
    'favoriteGeneration', coalesce(current_state.favorite_generation, 0),
    'mode', current_state.last_mode,
    'dataMode', current_state.last_data_mode,
    'resetAt', current_state.reset_at,
    'requestId', current_state.last_request_id
  );
end;
$$;

revoke all on function public.get_learning_reset_state_v96(text)
  from public, anon, authenticated;
grant execute on function public.get_learning_reset_state_v96(text)
  to authenticated, service_role;

create or replace function public.guard_user_record_generation_v96()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  expected_generation bigint := 0;
  inferred_exam_id text;
  image_question_count integer := 0;
  image_catalog_count integer := 0;
  image_exam_count integer := 0;
begin
  if tg_table_name in (
    'user_answer_records',
    'user_wrong_records',
    'user_favorite_records'
  ) then
    select catalog.exam_id into inferred_exam_id
    from public.leaderboard_question_catalog catalog
    where catalog.question_id = trim(to_jsonb(new)->>'question_id');
    if inferred_exam_id is null then
      raise exception 'unknown canonical question_id';
    end if;
  elsif tg_table_name = 'user_image_quiz_sessions' then
    if jsonb_typeof(to_jsonb(new)->'question_ids') <> 'array'
       or jsonb_array_length(to_jsonb(new)->'question_ids') < 1
       or jsonb_array_length(to_jsonb(new)->'question_ids') > 200 then
      raise exception 'image session requires 1 to 200 canonical question ids';
    end if;
    select
      count(*),
      count(catalog.question_id),
      count(distinct catalog.exam_id),
      min(catalog.exam_id)
    into
      image_question_count,
      image_catalog_count,
      image_exam_count,
      inferred_exam_id
    from jsonb_array_elements_text(to_jsonb(new)->'question_ids') ids(question_id)
    left join public.leaderboard_question_catalog catalog
      on catalog.question_id = ids.question_id;
    if image_question_count <> image_catalog_count or image_exam_count <> 1 then
      raise exception 'image session contains unknown or mixed-scope question ids';
    end if;
  elsif tg_table_name in ('user_quiz_progress', 'user_quiz_sessions') then
    if coalesce(new.exam_id, 'senior-securities') <> 'senior-securities' then
      raise exception '% does not support foreign-exchange scope', tg_table_name;
    end if;
    inferred_exam_id := 'senior-securities';
  else
    raise exception 'unsupported learning record table';
  end if;

  if inferred_exam_id not in ('senior-securities', 'junior-foreign-exchange') then
    raise exception 'invalid exam_id';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 96));
  select case
    when tg_table_name = 'user_wrong_records' then state.wrong_generation
    when tg_table_name = 'user_favorite_records' then state.favorite_generation
    else state.data_generation
  end
  into expected_generation
  from public.user_learning_reset_state state
  where state.user_id = new.user_id
    and state.exam_id = inferred_exam_id;
  expected_generation := coalesce(expected_generation, 0);

  if coalesce(new.reset_generation, 0) <> expected_generation then
    raise exception 'stale learning generation; refresh required'
      using errcode = 'P0001';
  end if;
  new.exam_id := inferred_exam_id;
  new.reset_generation := expected_generation;
  return new;
end;
$$;

revoke all on function public.guard_user_record_generation_v96()
  from public, anon, authenticated;

update public.user_favorite_records favorites
set reset_generation = coalesce((
  select state.favorite_generation
  from public.user_learning_reset_state state
  where state.user_id = favorites.user_id
    and state.exam_id = favorites.exam_id
), 0);

create table if not exists public.user_learning_delete_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,
  exam_id text not null check (exam_id in ('senior-securities', 'junior-foreign-exchange')),
  reset_generation bigint not null check (reset_generation >= 0),
  table_name text not null check (table_name in (
    'user_answer_records',
    'user_wrong_records',
    'user_favorite_records',
    'user_quiz_progress',
    'user_quiz_sessions',
    'user_image_quiz_sessions'
  )),
  record_keys jsonb not null check (jsonb_typeof(record_keys) = 'array'),
  is_clear boolean not null default false,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.user_learning_delete_operations enable row level security;
revoke all on public.user_learning_delete_operations
  from public, anon, authenticated;

revoke delete on table
  public.user_answer_records,
  public.user_wrong_records,
  public.user_favorite_records,
  public.user_quiz_progress,
  public.user_quiz_sessions,
  public.user_image_quiz_sessions
from authenticated;
-- PUBLIC/anon should not retain an inherited or manually-added destructive grant.
revoke delete on table
  public.user_answer_records,
  public.user_wrong_records,
  public.user_favorite_records,
  public.user_quiz_progress,
  public.user_quiz_sessions,
  public.user_image_quiz_sessions
from public, anon;

create or replace function public.delete_user_learning_records_v961(
  p_operation_id text,
  p_exam_id text,
  p_generation bigint,
  p_table_name text,
  p_keys text[] default array[]::text[],
  p_clear boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_exam_id text := lower(trim(coalesce(p_exam_id, '')));
  normalized_table_name text := lower(trim(coalesce(p_table_name, '')));
  normalized_operation_id text := trim(coalesce(p_operation_id, ''));
  normalized_keys text[] := array[]::text[];
  expected_generation bigint := 0;
  key_column text;
  target_record_type text;
  existing_operation public.user_learning_delete_operations%rowtype;
  deleted_keys text[] := array[]::text[];
  response jsonb;
begin
  if current_user_id is null then raise exception '請先登入。'; end if;
  if normalized_exam_id not in ('senior-securities', 'junior-foreign-exchange') then
    raise exception 'invalid exam_id';
  end if;
  if normalized_operation_id = '' or length(normalized_operation_id) > 128 then
    raise exception 'invalid operation_id';
  end if;
  if coalesce(p_generation, -1) < 0 then raise exception 'invalid generation'; end if;
  if normalized_table_name not in (
    'user_answer_records',
    'user_wrong_records',
    'user_favorite_records',
    'user_quiz_progress',
    'user_quiz_sessions',
    'user_image_quiz_sessions'
  ) then
    raise exception 'invalid learning table';
  end if;

  select coalesce(array_agg(item order by item), array[]::text[])
  into normalized_keys
  from (
    select distinct trim(raw_key) as item
    from unnest(coalesce(p_keys, array[]::text[])) raw(raw_key)
    where trim(coalesce(raw_key, '')) <> ''
  ) keys;
  if cardinality(normalized_keys) > 5000 then raise exception 'too many record keys'; end if;
  if not coalesce(p_clear, false) and cardinality(normalized_keys) = 0 then
    raise exception 'record keys are required';
  end if;

  case normalized_table_name
    when 'user_answer_records' then key_column := 'question_id'; target_record_type := 'answer';
    when 'user_wrong_records' then key_column := 'question_id'; target_record_type := 'wrong';
    when 'user_favorite_records' then key_column := 'question_id'; target_record_type := 'favorite';
    when 'user_quiz_progress' then key_column := 'scope_id'; target_record_type := 'progress';
    when 'user_quiz_sessions' then key_column := 'session_id'; target_record_type := 'session';
    when 'user_image_quiz_sessions' then key_column := 'session_id'; target_record_type := 'image_session';
  end case;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 96));

  select * into existing_operation
  from public.user_learning_delete_operations operations
  where operations.user_id = current_user_id
    and operations.operation_id = normalized_operation_id;
  if found then
    if existing_operation.exam_id <> normalized_exam_id
       or existing_operation.reset_generation <> p_generation
       or existing_operation.table_name <> normalized_table_name
       or existing_operation.record_keys <> to_jsonb(normalized_keys)
       or existing_operation.is_clear <> coalesce(p_clear, false) then
      raise exception 'operation_id already used for a different deletion';
    end if;
    return existing_operation.result;
  end if;

  select case
    when normalized_table_name = 'user_wrong_records' then state.wrong_generation
    when normalized_table_name = 'user_favorite_records' then state.favorite_generation
    else state.data_generation
  end
  into expected_generation
  from public.user_learning_reset_state state
  where state.user_id = current_user_id
    and state.exam_id = normalized_exam_id;
  expected_generation := coalesce(expected_generation, 0);
  if p_generation <> expected_generation then
    raise exception 'stale learning generation; refresh required'
      using errcode = 'P0001';
  end if;

  if coalesce(p_clear, false) then
    execute format(
      'with deleted as (
         delete from public.%1$I
         where user_id = $1 and exam_id = $2 and reset_generation = $3
         returning %2$I
       )
       select coalesce(array_agg(%2$I::text order by %2$I::text), array[]::text[])
       from deleted',
      normalized_table_name,
      key_column
    ) into deleted_keys
    using current_user_id, normalized_exam_id, p_generation;
  else
    execute format(
      'with deleted as (
         delete from public.%1$I
         where user_id = $1 and exam_id = $2 and reset_generation = $3
           and %2$I = any($4)
         returning %2$I
       )
       select coalesce(array_agg(%2$I::text order by %2$I::text), array[]::text[])
       from deleted',
      normalized_table_name,
      key_column
    ) into deleted_keys
    using current_user_id, normalized_exam_id, p_generation, normalized_keys;
  end if;

  insert into public.user_record_tombstones (
    user_id, record_type, record_key, deleted_at, updated_at
  )
  select current_user_id, target_record_type, deleted_key, clock_timestamp(), clock_timestamp()
  from unnest(deleted_keys) deleted(deleted_key)
  on conflict (user_id, record_type, record_key) do update
    set deleted_at = excluded.deleted_at,
        updated_at = excluded.updated_at;

  response := jsonb_build_object(
    'operationId', normalized_operation_id,
    'deletedCount', cardinality(deleted_keys),
    'deletedKeys', to_jsonb(deleted_keys)
  );
  insert into public.user_learning_delete_operations (
    user_id, operation_id, exam_id, reset_generation,
    table_name, record_keys, is_clear, result
  ) values (
    current_user_id, normalized_operation_id, normalized_exam_id, p_generation,
    normalized_table_name, to_jsonb(normalized_keys), coalesce(p_clear, false), response
  );
  return response;
end;
$$;

revoke all on function public.delete_user_learning_records_v961(
  text,text,bigint,text,text[],boolean
) from public, anon, authenticated;
grant execute on function public.delete_user_learning_records_v961(
  text,text,bigint,text,text[],boolean
) to authenticated, service_role;

revoke delete on table public.user_record_tombstones
from public, anon, authenticated;

create or replace function public.clear_user_record_tombstones_v961(
  p_record_type text,
  p_keys text[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_record_type text := lower(trim(coalesce(p_record_type, '')));
  normalized_keys text[] := array[]::text[];
  source_table text;
  key_column text;
  deleted_count integer := 0;
begin
  if current_user_id is null then raise exception '請先登入。'; end if;
  if normalized_record_type not in (
    'answer', 'wrong', 'favorite', 'progress', 'session', 'image_session'
  ) then
    raise exception 'invalid record type';
  end if;
  select coalesce(array_agg(item order by item), array[]::text[])
  into normalized_keys
  from (
    select distinct trim(raw_key) as item
    from unnest(coalesce(p_keys, array[]::text[])) raw(raw_key)
    where trim(coalesce(raw_key, '')) <> ''
  ) keys;
  if cardinality(normalized_keys) > 5000 then raise exception 'too many record keys'; end if;
  if cardinality(normalized_keys) = 0 then return 0; end if;

  case normalized_record_type
    when 'answer' then source_table := 'user_answer_records'; key_column := 'question_id';
    when 'wrong' then source_table := 'user_wrong_records'; key_column := 'question_id';
    when 'favorite' then source_table := 'user_favorite_records'; key_column := 'question_id';
    when 'progress' then source_table := 'user_quiz_progress'; key_column := 'scope_id';
    when 'session' then source_table := 'user_quiz_sessions'; key_column := 'session_id';
    when 'image_session' then source_table := 'user_image_quiz_sessions'; key_column := 'session_id';
  end case;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 96));
  execute format(
    'delete from public.user_record_tombstones tombstones
     using public.%1$I live
     where tombstones.user_id = $1
       and tombstones.record_type = $2
       and tombstones.record_key = any($3)
       and live.user_id = $1
       and live.%2$I::text = tombstones.record_key
       and live.sync_version > tombstones.sync_version',
    source_table,
    key_column
  ) using current_user_id, normalized_record_type, normalized_keys;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.clear_user_record_tombstones_v961(text,text[])
  from public, anon, authenticated;
grant execute on function public.clear_user_record_tombstones_v961(text,text[])
  to authenticated, service_role;

create or replace function public.reset_learning_data_v96(
  p_scope text,
  p_mode text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_scope text := lower(trim(coalesce(p_scope, '')));
  normalized_mode text := lower(trim(coalesce(p_mode, '')));
  existing_request public.user_learning_reset_requests%rowtype;
  next_securities_generation bigint := 0;
  next_securities_wrong_generation bigint := 0;
  next_securities_favorite_generation bigint := 0;
  next_foreign_exchange_generation bigint := 0;
  next_foreign_exchange_wrong_generation bigint := 0;
  next_foreign_exchange_favorite_generation bigint := 0;
  reset_timestamp timestamptz := clock_timestamp();
  response jsonb;
begin
  if current_user_id is null then raise exception '請先登入。'; end if;
  if normalized_scope not in ('senior-securities', 'junior-foreign-exchange', 'all') then
    raise exception 'invalid scope';
  end if;
  if normalized_mode not in ('wrong', 'restart', 'complete') then
    raise exception 'invalid mode';
  end if;
  if p_request_id is null then raise exception 'request_id is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 96));

  select * into existing_request
  from public.user_learning_reset_requests requests
  where requests.user_id = current_user_id
    and requests.request_id = p_request_id;
  if found then
    if existing_request.scope <> normalized_scope or existing_request.mode <> normalized_mode then
      raise exception 'request_id already used for a different reset';
    end if;
    response := existing_request.result;
    if not (response ? 'securitiesFavoriteGeneration') then
      response := response || jsonb_build_object(
        'securitiesFavoriteGeneration', case
          when existing_request.result->>'securitiesWrongGeneration' is null then null
          else (
            select count(*)::bigint
            from public.user_learning_reset_requests requests
            where requests.user_id = current_user_id
              and requests.mode = 'complete'
              and requests.scope in ('senior-securities', 'all')
              and (requests.result->>'securitiesWrongGeneration')::bigint <=
                (existing_request.result->>'securitiesWrongGeneration')::bigint
          )
        end,
        'foreignExchangeFavoriteGeneration', case
          when existing_request.result->>'foreignExchangeWrongGeneration' is null then null
          else (
            select count(*)::bigint
            from public.user_learning_reset_requests requests
            where requests.user_id = current_user_id
              and requests.mode = 'complete'
              and requests.scope in ('junior-foreign-exchange', 'all')
              and (requests.result->>'foreignExchangeWrongGeneration')::bigint <=
                (existing_request.result->>'foreignExchangeWrongGeneration')::bigint
          )
        end
      );
      update public.user_learning_reset_requests
      set result = response
      where user_id = current_user_id and request_id = p_request_id;
    end if;
    return response;
  end if;

  if normalized_scope in ('senior-securities', 'all') then
    insert into public.user_learning_reset_state (
      user_id, exam_id, data_generation, wrong_generation, favorite_generation,
      last_mode, last_data_mode, last_request_id,
      reset_at, updated_at
    ) values (
      current_user_id,
      'senior-securities',
      case when normalized_mode = 'wrong' then 0 else 1 end,
      1,
      case when normalized_mode = 'complete' then 1 else 0 end,
      normalized_mode,
      case when normalized_mode = 'wrong' then null else normalized_mode end,
      p_request_id,
      reset_timestamp, reset_timestamp
    )
    on conflict (user_id, exam_id) do update
      set data_generation = public.user_learning_reset_state.data_generation +
            case when normalized_mode = 'wrong' then 0 else 1 end,
          wrong_generation = public.user_learning_reset_state.wrong_generation + 1,
          favorite_generation = public.user_learning_reset_state.favorite_generation +
            case when normalized_mode = 'complete' then 1 else 0 end,
          last_mode = excluded.last_mode,
          last_data_mode = case
            when normalized_mode = 'wrong' then public.user_learning_reset_state.last_data_mode
            else excluded.last_data_mode
          end,
          last_request_id = excluded.last_request_id,
          reset_at = excluded.reset_at,
          updated_at = excluded.updated_at
    returning data_generation, wrong_generation, favorite_generation
    into next_securities_generation, next_securities_wrong_generation,
      next_securities_favorite_generation;

    delete from public.user_wrong_records
    where user_id = current_user_id and exam_id = 'senior-securities';
    if normalized_mode in ('restart', 'complete') then
      delete from public.user_answer_records
      where user_id = current_user_id and exam_id = 'senior-securities';
      delete from public.user_quiz_progress
      where user_id = current_user_id and exam_id = 'senior-securities';
      delete from public.user_quiz_sessions
      where user_id = current_user_id and exam_id = 'senior-securities';
      delete from public.user_image_quiz_sessions
      where user_id = current_user_id and exam_id = 'senior-securities';
      delete from public.answer_attempts where user_id = current_user_id;
      delete from public.question_learning_states where user_id = current_user_id;
      delete from public.leaderboard_answer_events where user_id = current_user_id;
      delete from public.leaderboard_unique_questions where user_id = current_user_id;
      delete from public.leaderboard_practice_events where user_id = current_user_id;
      delete from public.user_leaderboard_stats where user_id = current_user_id;
    end if;
    if normalized_mode = 'complete' then
      delete from public.user_favorite_records
      where user_id = current_user_id and exam_id = 'senior-securities';
    elsif normalized_mode = 'restart' then
      update public.user_favorite_records
      set reset_generation = next_securities_favorite_generation
      where user_id = current_user_id and exam_id = 'senior-securities';
    end if;
  end if;

  if normalized_scope in ('junior-foreign-exchange', 'all') then
    insert into public.user_learning_reset_state (
      user_id, exam_id, data_generation, wrong_generation, favorite_generation,
      last_mode, last_data_mode, last_request_id,
      reset_at, updated_at
    ) values (
      current_user_id,
      'junior-foreign-exchange',
      case when normalized_mode = 'wrong' then 0 else 1 end,
      1,
      case when normalized_mode = 'complete' then 1 else 0 end,
      normalized_mode,
      case when normalized_mode = 'wrong' then null else normalized_mode end,
      p_request_id,
      reset_timestamp, reset_timestamp
    )
    on conflict (user_id, exam_id) do update
      set data_generation = public.user_learning_reset_state.data_generation +
            case when normalized_mode = 'wrong' then 0 else 1 end,
          wrong_generation = public.user_learning_reset_state.wrong_generation + 1,
          favorite_generation = public.user_learning_reset_state.favorite_generation +
            case when normalized_mode = 'complete' then 1 else 0 end,
          last_mode = excluded.last_mode,
          last_data_mode = case
            when normalized_mode = 'wrong' then public.user_learning_reset_state.last_data_mode
            else excluded.last_data_mode
          end,
          last_request_id = excluded.last_request_id,
          reset_at = excluded.reset_at,
          updated_at = excluded.updated_at
    returning data_generation, wrong_generation, favorite_generation
    into next_foreign_exchange_generation, next_foreign_exchange_wrong_generation,
      next_foreign_exchange_favorite_generation;

    delete from public.user_wrong_records
    where user_id = current_user_id and exam_id = 'junior-foreign-exchange';
    if normalized_mode in ('restart', 'complete') then
      delete from public.user_answer_records
      where user_id = current_user_id and exam_id = 'junior-foreign-exchange';
      delete from public.user_quiz_progress
      where user_id = current_user_id and exam_id = 'junior-foreign-exchange';
      delete from public.user_quiz_sessions
      where user_id = current_user_id and exam_id = 'junior-foreign-exchange';
      delete from public.user_image_quiz_sessions
      where user_id = current_user_id and exam_id = 'junior-foreign-exchange';
    end if;
    if normalized_mode = 'complete' then
      delete from public.user_favorite_records
      where user_id = current_user_id and exam_id = 'junior-foreign-exchange';
    elsif normalized_mode = 'restart' then
      update public.user_favorite_records
      set reset_generation = next_foreign_exchange_favorite_generation
      where user_id = current_user_id and exam_id = 'junior-foreign-exchange';
    end if;
  end if;

  response := jsonb_build_object(
    'requestId', p_request_id,
    'scope', normalized_scope,
    'mode', normalized_mode,
    'resetAt', reset_timestamp,
    'securitiesGeneration', case
      when normalized_scope in ('senior-securities', 'all') then next_securities_generation
      else null
    end,
    'securitiesWrongGeneration', case
      when normalized_scope in ('senior-securities', 'all') then next_securities_wrong_generation
      else null
    end,
    'securitiesFavoriteGeneration', case
      when normalized_scope in ('senior-securities', 'all') then next_securities_favorite_generation
      else null
    end,
    'foreignExchangeGeneration', case
      when normalized_scope in ('junior-foreign-exchange', 'all') then next_foreign_exchange_generation
      else null
    end,
    'foreignExchangeWrongGeneration', case
      when normalized_scope in ('junior-foreign-exchange', 'all') then next_foreign_exchange_wrong_generation
      else null
    end,
    'foreignExchangeFavoriteGeneration', case
      when normalized_scope in ('junior-foreign-exchange', 'all') then next_foreign_exchange_favorite_generation
      else null
    end
  );

  insert into public.user_learning_reset_requests (
    user_id, request_id, scope, mode, result
  ) values (
    current_user_id, p_request_id, normalized_scope, normalized_mode, response
  );
  return response;
end;
$$;

revoke all on function public.reset_learning_data_v96(text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.reset_learning_data_v96(text,text,uuid)
  to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
