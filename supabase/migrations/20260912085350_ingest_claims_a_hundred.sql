-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.schedule_workers()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Every two minutes, which claim_ingest_jobs reasons its reclaim window from. A hundred at a
  -- time, eight at once: the batch used to be twenty-five because the jobs ran in sequence and
  -- that was all that fitted in the budget. A hundred now takes about three seconds.
  perform cron.schedule(
    'ingest-worker', '*/2 * * * *',
    $job$select public.invoke_worker('ingest-worker', 100)$job$
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

  -- Every five minutes through the 02:00 hour. One firing drains a batch, and a fleet with more
  -- spaces than that has the rest of the hour. An empty queue costs one select.
  perform cron.schedule(
    'dream-worker', '*/5 2 * * *',
    $job$select public.invoke_worker('dream-worker', 8)$job$
  );
end;
$function$;