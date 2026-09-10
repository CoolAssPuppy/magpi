-- Reclaim an ingest job left at 'running' by a dead worker, after fifteen minutes.

create or replace function public.claim_ingest_jobs(p_limit integer)
returns setof public.ingest_jobs
language sql
security definer
set search_path = ''
as $$
  -- Requeue a stale 'running' job. Attempts is deliberately not incremented here.
  with reclaimed as (
    update public.ingest_jobs
    set status = 'queued'
    where status = 'running'
      and claimed_at < now() - interval '15 minutes'
    returning id
  ),
  -- Retire what the claim skips, so a poison job does not sit at 'queued' forever.
  retired as (
    update public.ingest_jobs
    set status = 'failed',
        error = 'gave up after 3 attempts'
    where status = 'queued' and attempts >= 3
    returning id
  )
  update public.ingest_jobs j
  set status = 'running',
      claimed_at = now(),
      attempts = j.attempts + 1
  where j.id in (
    select c.id
    from public.ingest_jobs c
    where c.status = 'queued'
      -- Three attempts, because an ingest failure is usually deterministic.
      and c.attempts < 3
    order by c.created_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning j.*;
$$;

-- create or replace resets the ACL, so the revoke is repeated. Fourth time.
revoke all on function public.claim_ingest_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_ingest_jobs(integer) to service_role;
