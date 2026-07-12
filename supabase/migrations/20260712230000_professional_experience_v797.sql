-- SeniorSecurities v79.7
-- Public leaderboard avatars and single-owner direct question publishing.

alter table public.user_leaderboard_profiles
  add column if not exists avatar_path text;

alter table public.user_leaderboard_profiles
  drop constraint if exists user_leaderboard_profiles_avatar_path_check;
alter table public.user_leaderboard_profiles
  add constraint user_leaderboard_profiles_avatar_path_check
  check (
    avatar_path is null
    or (
      char_length(avatar_path) between 38 and 160
      and avatar_path ~ '^[0-9a-fA-F-]{36}/avatar\.(webp|png|jpg|jpeg)$'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leaderboard-avatars',
  'leaderboard-avatars',
  true,
  2097152,
  array['image/webp','image/png','image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public leaderboard avatars are readable" on storage.objects;
create policy "Public leaderboard avatars are readable"
  on storage.objects for select
  to public
  using (bucket_id = 'leaderboard-avatars');

drop policy if exists "Users can upload own leaderboard avatar" on storage.objects;
create policy "Users can upload own leaderboard avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'leaderboard-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update own leaderboard avatar" on storage.objects;
create policy "Users can update own leaderboard avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'leaderboard-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'leaderboard-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete own leaderboard avatar" on storage.objects;
create policy "Users can delete own leaderboard avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'leaderboard-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.update_leaderboard_avatar_v797(p_avatar_path text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_path text := nullif(trim(coalesce(p_avatar_path, '')), '');
begin
  if current_user_id is null then
    raise exception '請先登入。';
  end if;
  if normalized_path is not null and normalized_path <> (current_user_id::text || '/avatar.webp') then
    raise exception '頭像路徑不正確。';
  end if;

  insert into public.user_leaderboard_profiles (user_id, display_name, avatar_path, updated_at)
  values (
    current_user_id,
    public.default_leaderboard_display_name(current_user_id),
    normalized_path,
    now()
  )
  on conflict (user_id) do update set
    avatar_path = excluded.avatar_path,
    updated_at = now();
end;
$$;
revoke all on function public.update_leaderboard_avatar_v797(text) from public, anon;
grant execute on function public.update_leaderboard_avatar_v797(text) to authenticated;

create or replace function public.publish_question_overrides_v797(
  p_version text,
  p_title text,
  p_notes text,
  p_items jsonb,
  p_actor_user_id uuid,
  p_actor_email text default null,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_release_id uuid;
  current_active uuid;
  inserted_count integer := 0;
  expected_count integer := 0;
begin
  if p_actor_user_id is null then raise exception 'invalid actor'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'items must be an array'; end if;
  expected_count := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  if expected_count < 1 then raise exception 'no question changes to publish'; end if;
  if expected_count > 5000 then raise exception 'release item limit exceeded'; end if;

  insert into public.question_release_batches (
    version,
    status,
    title,
    notes,
    created_by,
    created_at
  ) values (
    left(trim(p_version), 80),
    'draft',
    left(coalesce(nullif(trim(p_title), ''), '題庫內容更新'), 160),
    nullif(left(trim(coalesce(p_notes, '')), 1200), ''),
    p_actor_user_id,
    now()
  ) returning id into new_release_id;

  insert into public.question_release_items (release_id, question_id, payload, payload_hash)
  select
    new_release_id,
    item->>'questionId',
    item->'payload',
    item->>'payloadHash'
  from jsonb_array_elements(p_items) item
  where nullif(trim(item->>'questionId'), '') is not null
    and item ? 'payload'
    and nullif(trim(item->>'payloadHash'), '') is not null;

  get diagnostics inserted_count = row_count;
  if inserted_count <> expected_count then
    raise exception 'release item validation failed';
  end if;

  update public.question_release_batches
     set status = 'published',
         published_by = p_actor_user_id,
         published_at = now()
   where id = new_release_id and status = 'draft';
  if not found then raise exception 'publication state changed concurrently'; end if;

  insert into public.question_release_pointer (singleton, active_release_id, previous_release_id, updated_by, updated_at)
  values (true, null, null, p_actor_user_id, now())
  on conflict (singleton) do nothing;

  select active_release_id
    into current_active
    from public.question_release_pointer
   where singleton = true
   for update;

  update public.question_release_pointer
     set previous_release_id = current_active,
         active_release_id = new_release_id,
         updated_by = p_actor_user_id,
         updated_at = now()
   where singleton = true;

  insert into public.admin_audit_events(actor_user_id, actor_email, action, metadata, ip_address)
  values (
    p_actor_user_id,
    coalesce(nullif(trim(p_actor_email), ''), p_actor_user_id::text),
    'question_release.publish_direct',
    jsonb_build_object(
      'releaseId', new_release_id,
      'version', p_version,
      'previousReleaseId', current_active,
      'itemCount', inserted_count
    ),
    p_ip_address
  );

  return jsonb_build_object(
    'releaseId', new_release_id,
    'previousReleaseId', current_active,
    'itemCount', inserted_count
  );
end;
$$;
revoke all on function public.publish_question_overrides_v797(text,text,text,jsonb,uuid,text,text) from public, anon, authenticated;
grant execute on function public.publish_question_overrides_v797(text,text,text,jsonb,uuid,text,text) to service_role;

select pg_notify('pgrst', 'reload schema');
