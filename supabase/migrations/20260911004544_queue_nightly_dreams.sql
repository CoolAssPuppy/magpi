-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.queue_nightly_dreams()
  RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with queued as (
    insert into public.dream_runs (org_id, space_id, kind)
    select s.org_id, s.id, k.kind
    from public.spaces s
    cross join unnest(enum_range(null::public.dream_kind)) as k(kind)
    where s.dreaming_enabled
      and not exists (
        select 1 from public.dream_runs r
        where r.space_id = s.id
          and r.kind = k.kind
          and r.status in ('queued', 'running')
      )
    returning 1
  )
  select count(*)::integer from queued;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_workers()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Every two minutes, which claim_ingest_jobs reasons its reclaim window from.
  perform cron.schedule(
    'ingest-worker', '*/2 * * * *',
    $job$select public.invoke_worker('ingest-worker', 25)$job$
  );

  perform cron.schedule(
    'sync-worker', '0 * * * *',
    $job$select public.invoke_worker('sync-worker', 10)$job$
  );

  -- 01:55 UTC, so the queue is full before the worker looks at it.
  perform cron.schedule(
    'queue-nightly-dreams', '55 1 * * *',
    $job$select public.queue_nightly_dreams()$job$
  );

  -- 02:00 UTC. The dream job staggers by organization id itself.
  perform cron.schedule(
    'dream-worker', '0 2 * * *',
    $job$select public.invoke_worker('dream-worker', 5)$job$
  );
end;
$function$;
-- Hand-written. pg-delta does not emit revokes, so a new function stays executable by PUBLIC,
-- which is what 60_functions.test.sql catches. Only pg_cron, running as the table owner, calls
-- this, so no client role needs it.
REVOKE ALL ON FUNCTION public.queue_nightly_dreams()
  FROM public, anon, authenticated, service_role;
