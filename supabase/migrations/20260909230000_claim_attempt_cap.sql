-- Cap ingest attempts, and retire what the cap skips.
--
-- `claim_ingest_jobs` incremented `attempts` on every claim and nothing bounded
-- it. There is no path today that returns a failed job to 'queued', so this was
-- latent rather than live, but the cap belongs in the claim where it binds every
-- caller rather than in one worker.
--
-- The important half is what happens at the cap. A bare `attempts < 3` leaves a
-- poison job at 'queued' forever, invisible to a page filtering on failures,
-- which is exactly the spinner that never resolves. So the claim retires what it
-- skips, and ingest_jobs_terminal_has_error makes sure it carries a reason a
-- person can read.

create or replace function public.claim_ingest_jobs(p_limit integer)
returns setof public.ingest_jobs
language sql
security definer
set search_path = ''
as $$
  -- Retire what the claim is about to skip. `attempts < 3` alone would leave a
  -- poison job sitting at 'queued' forever, invisible to a page filtering on
  -- failures, which is the spinner that never resolves the spec is explicit
  -- about. A data-modifying CTE always runs to completion whether or not the
  -- outer query reads it, and the two row sets are disjoint on `attempts`.
  with retired as (
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
      -- Three, because an ingest failure is usually deterministic: an unreadable
      -- file, a revoked token. Attempts two and three are cheap insurance
      -- against a transient provider blip and a fourth pays OpenAI to fail the
      -- same way again.
      and c.attempts < 3
    order by c.created_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning j.*;
$$;

-- create or replace resets the ACL, so the revoke has to be repeated. This is
-- the third time pg-delta's habit of emitting grants without revokes has mattered.
revoke all on function public.claim_ingest_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_ingest_jobs(integer) to service_role;
