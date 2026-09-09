-- Take back a claim whose worker never came back.
--
-- claimed_at was written on every claim and read by nothing. A worker that dies
-- mid-job leaves its row at 'running', where both halves of the claim function
-- cannot see it, because both filter on 'queued'. The job is stranded
-- permanently and the page shows a spinner that never resolves: the outcome the
-- attempt cap prevents, reached through a different door. The cap cannot help,
-- since it fires on 'queued' and a stranded job is never queued again.
--
-- Fifteen minutes needs no measurement to justify. The job body times itself out
-- at 45 seconds, so nothing legitimate is still running at twenty times that.

create or replace function public.claim_ingest_jobs(p_limit integer)
returns setof public.ingest_jobs
language sql
security definer
set search_path = ''
as $$
  -- Take back a claim whose worker never came back. A job left at 'running' is
  -- invisible to both halves below, which filter on 'queued', so nothing else in
  -- the system would ever touch it again and the page would show a spinner that
  -- never resolves. claimed_at exists for this and nothing else.
  --
  -- Fifteen minutes is safe without waiting on the measured Edge Function
  -- ceiling, because the job body times itself out at DEFAULT_BUDGET_MS, which
  -- is 45 seconds. No legitimate ingest is still running at twenty times that.
  --
  -- The reclaim increments nothing. The attempt was counted when the job was
  -- claimed, and counting it again would charge a crashed worker twice and
  -- retire a healthy document after two real failures.
  --
  -- All three statements see the same snapshot, so a job reclaimed here becomes
  -- claimable on the next invocation rather than this one. At a two-minute
  -- worker interval that is not worth the complexity of avoiding.
  with reclaimed as (
    update public.ingest_jobs
    set status = 'queued'
    where status = 'running'
      and claimed_at < now() - interval '15 minutes'
    returning id
  ),
  -- Retire what the claim is about to skip. `attempts < 3` alone would leave a
  -- poison job sitting at 'queued' forever, invisible to a page filtering on
  -- failures, which is the spinner that never resolves the spec is explicit
  -- about. A data-modifying CTE always runs to completion whether or not the
  -- outer query reads it, and the two row sets are disjoint on `attempts`.
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

-- create or replace resets the ACL, so the revoke is repeated. Fourth time.
revoke all on function public.claim_ingest_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_ingest_jobs(integer) to service_role;
