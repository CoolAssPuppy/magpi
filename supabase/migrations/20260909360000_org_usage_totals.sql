-- Sum the plan meters in the database, not through PostgREST aggregates.

-- The three plan meters, summed in the database.
--
-- The admin page read these with PostgREST's `quantity.sum()`, three round
-- trips, and a deployment whose PostgREST has `db-aggregates-enabled = false`
-- answers "Use of aggregate functions is not allowed" to all three. That is not
-- a hypothetical: the Supabase CLI ships with them off, so the usage panel was
-- broken on every local run of this repo.
--
-- One statement, one trip, and a filtered aggregate per meter so the query
-- reads the table once. security invoker, so usage_events_select_admin decides
-- who sees it rather than this function.
create or replace function public.org_usage_totals(p_org_id uuid, p_month_start timestamptz)
returns table (documents bigint, queries bigint, storage_bytes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(quantity) filter (where kind = 'document_ingested'), 0)::bigint,
    -- The only one with a window. A monthly limit read over all time is a
    -- lifetime cap wearing the word monthly.
    coalesce(sum(quantity) filter (where kind = 'query' and occurred_at >= p_month_start), 0)::bigint,
    coalesce(sum(quantity) filter (where kind = 'storage_bytes'), 0)::bigint
  from public.usage_events
  where org_id = p_org_id;
$$;

revoke all on function public.org_usage_totals(uuid, timestamptz) from public, anon;
grant execute on function public.org_usage_totals(uuid, timestamptz) to authenticated, service_role;
