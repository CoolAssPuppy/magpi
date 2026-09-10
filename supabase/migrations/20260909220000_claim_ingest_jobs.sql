-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.claim_ingest_jobs (
  p_limit integer
)
  RETURNS SETOF public.ingest_jobs
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  update public.ingest_jobs j
  set status = 'running',
      claimed_at = now(),
      attempts = j.attempts + 1
  where j.id in (
    select c.id
    from public.ingest_jobs c
    where c.status = 'queued'
    order by c.created_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning j.*;
$function$;

GRANT ALL ON FUNCTION public.claim_ingest_jobs(integer) TO service_role;
-- pg-delta emits grants and never revokes, so a new function arrives executable by PUBLIC.
revoke all on function public.claim_ingest_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_ingest_jobs(integer) to service_role;
