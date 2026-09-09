-- Scheduling lives in the database, next to the work.
--
-- The alternative was three Vercel crons calling three Next.js routes that held
-- the service role key and forwarded it. That worked, and it made the schedule a
-- property of one hosting provider: a deployment anywhere else, or a clone with
-- no Vercel account, had background work that never ran and nothing saying so.
-- Ingest, sync and dreaming are the product, not the website.
--
-- pg_cron holds the schedule and pg_net makes the call. Both are declared in
-- 00_extensions.sql.

-- The two values a tick needs, read at fire time rather than written into the
-- schedule.
--
-- `cron.job.command` is readable by anyone who can read the catalog, so a
-- service role key pasted into a schedule is a service role key in a table. The
-- command below names this function and nothing else; the secrets stay in
-- Vault, which is what Vault is for.
--
-- Reading them at fire time also means one schedule works in every environment:
-- local, preview and production differ by two rows, not by a migration.
create or replace function public.invoke_worker(p_worker text, p_batch integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_key text;
begin
  select decrypted_secret into v_base
  from vault.decrypted_secrets where name = 'worker_base_url';

  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'worker_service_key';

  -- A database nobody has configured ticks and does nothing. That is the state
  -- every fresh `supabase db reset` is in, and firing at a URL that is not
  -- there would fill net._http_response with failures that mean nothing.
  if v_base is null or v_key is null then
    return;
  end if;

  -- Two minutes, against a pg_net default of five seconds. A batch of 25 takes
  -- longer than five seconds whenever there is anything to do, so the default
  -- wrote a timeout row for every tick that did work.
  --
  -- The request timing out does not stop the work: the function keeps running
  -- after pg_net hangs up, measured here at 51 of 70 seeded jobs finishing
  -- across three timed-out ticks. The response row is diagnostics, and this is
  -- what makes it worth reading.
  perform net.http_post(
    url := rtrim(v_base, '/') || '/functions/v1/' || p_worker,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('batch', p_batch),
    timeout_milliseconds := 120000
  );
end;
$$;

-- Nobody but the scheduler. The function reads a service role key out of Vault
-- and calls anything named `p_worker`, so a client that could execute it could
-- make the platform work for free.
revoke all on function public.invoke_worker(text, integer)
  from public, anon, authenticated, service_role;

-- The schedule itself.
--
-- One function rather than three loose `cron.schedule` calls, so the whole
-- schedule reads in one place and a migration re-applies it by calling this
-- again. `cron.schedule` upserts on the job name, so running it twice is not
-- two jobs.
--
-- token-refresh is deliberately absent. The sync path renews a token on its way
-- past, which covers every connection the hourly tick touches, and the case
-- left open is a connection nobody syncs until the refresh token itself lapses.
-- That shows up as a failed sync with a message naming the provider.
create or replace function public.schedule_workers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Every two minutes, because claim_ingest_jobs reasons its fifteen-minute
  -- reclaim window from this interval.
  perform cron.schedule(
    'ingest-worker', '*/2 * * * *',
    $job$select public.invoke_worker('ingest-worker', 25)$job$
  );

  perform cron.schedule(
    'sync-worker', '0 * * * *',
    $job$select public.invoke_worker('sync-worker', 10)$job$
  );

  -- 02:00 UTC. The dream job staggers by organization id itself, so tenants do
  -- not all wake on the same minute.
  perform cron.schedule(
    'dream-worker', '0 2 * * *',
    $job$select public.invoke_worker('dream-worker', 5)$job$
  );
end;
$$;

revoke all on function public.schedule_workers()
  from public, anon, authenticated, service_role;
