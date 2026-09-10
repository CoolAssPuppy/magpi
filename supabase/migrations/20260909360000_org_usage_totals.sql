-- Sum the plan meters in the database, not through PostgREST aggregates.

-- The three plan meters in one statement. security invoker, so usage_events_select_admin applies.
create or replace function public.org_usage_totals(p_org_id uuid, p_month_start timestamptz)
returns table (documents bigint, queries bigint, storage_bytes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(quantity) filter (where kind = 'document_ingested'), 0)::bigint,
    -- The only meter with a month window, because its limit is monthly.
    coalesce(sum(quantity) filter (where kind = 'query' and occurred_at >= p_month_start), 0)::bigint,
    coalesce(sum(quantity) filter (where kind = 'storage_bytes'), 0)::bigint
  from public.usage_events
  where org_id = p_org_id;
$$;

revoke all on function public.org_usage_totals(uuid, timestamptz) from public, anon;
grant execute on function public.org_usage_totals(uuid, timestamptz) to authenticated, service_role;
