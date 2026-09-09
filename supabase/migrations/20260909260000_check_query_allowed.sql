-- Enforce the monthly question limit that plan_monthly_query_limit describes.
--
-- The limit was read by the usage panel and enforced by nothing, and the meter
-- it counts against was written by nothing either, so `usage_events` held no
-- row with kind 'query' anywhere in the product. The panel reported zero
-- questions for every organization and the free plan's 500 was decoration.
--
-- The chat route calls this before it loads a conversation, and writes the
-- meter row once an answer is stored.

-- The window is the calendar month in UTC, which is what the usage panel already
-- sums over. Billing periods do not line up with calendar months, and when they
-- need to this reads the period off the subscription instead.
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
