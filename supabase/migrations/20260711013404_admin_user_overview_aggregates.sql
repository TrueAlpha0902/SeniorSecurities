-- Aggregate admin overview metrics inside Postgres so the API never needs to
-- download answer or login-event detail rows. This RPC is intentionally
-- callable only by the server-side service role.

create or replace function public.admin_user_overview_aggregates(p_user_ids uuid[])
returns table (
  user_id uuid,
  practiced_question_count bigint,
  last_answer_at timestamptz,
  login_event_count bigint,
  last_event_at timestamptz,
  last_event_type text,
  last_ip text
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with requested_users as materialized (
    select distinct requested.user_id
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as requested(user_id)
    where requested.user_id is not null
  ),
  answer_aggregates as (
    select
      answer.user_id,
      count(distinct answer.question_id)::bigint as practiced_question_count,
      max(answer.answered_at) as last_answer_at
    from public.user_answer_records as answer
    inner join requested_users as requested on requested.user_id = answer.user_id
    group by answer.user_id
  ),
  ranked_logins as (
    select
      audit.user_id,
      count(*) over (partition by audit.user_id)::bigint as login_event_count,
      audit.created_at as last_event_at,
      audit.event_type as last_event_type,
      audit.ip_address as last_ip,
      row_number() over (
        partition by audit.user_id
        order by audit.created_at desc, audit.id desc
      ) as recency_rank
    from public.login_audit_events as audit
    inner join requested_users as requested on requested.user_id = audit.user_id
  ),
  latest_logins as (
    select
      ranked.user_id,
      ranked.login_event_count,
      ranked.last_event_at,
      ranked.last_event_type,
      ranked.last_ip
    from ranked_logins as ranked
    where ranked.recency_rank = 1
  )
  select
    requested.user_id,
    coalesce(answer.practiced_question_count, 0::bigint) as practiced_question_count,
    answer.last_answer_at,
    coalesce(audit.login_event_count, 0::bigint) as login_event_count,
    audit.last_event_at,
    audit.last_event_type,
    audit.last_ip
  from requested_users as requested
  left join answer_aggregates as answer on answer.user_id = requested.user_id
  left join latest_logins as audit on audit.user_id = requested.user_id;
$function$;

revoke all on function public.admin_user_overview_aggregates(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_user_overview_aggregates(uuid[]) to service_role;

comment on function public.admin_user_overview_aggregates(uuid[]) is
  'Service-role-only aggregate metrics for the administrator user overview.';

select pg_notify('pgrst', 'reload schema');
