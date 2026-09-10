-- Enforce the monthly question limit that plan_monthly_query_limit describes.

-- The window is the calendar month in UTC, which is what the usage panel sums over.
create or replace function public.check_query_allowed(p_org_id uuid)
returns table (allowed boolean, reason text, used bigint, plan_limit integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.org_plan;
  v_limit integer;
  v_used bigint;
begin
  select plan into v_plan from public.organizations where id = p_org_id;
  if v_plan is null then
    return query select false, 'organization not found'::text, 0::bigint, 0;
    return;
  end if;

  v_limit := public.plan_monthly_query_limit(v_plan);

  select coalesce(sum(quantity), 0) into v_used
  from public.usage_events
  where org_id = p_org_id
    and kind = 'query'
    and occurred_at >= date_trunc('month', now() at time zone 'utc');

  if v_used >= v_limit then
    return query select false, format('question limit reached for %s plan', v_plan), v_used, v_limit;
  else
    return query select true, null::text, v_used, v_limit;
  end if;
end;
$$;

revoke all on function public.check_query_allowed(uuid) from public, anon;
grant execute on function public.check_query_allowed(uuid) to authenticated, service_role;
