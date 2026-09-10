-- The worker schedule: pg_cron holds it, pg_net makes the call, Vault holds the two tick values.

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

  -- An unconfigured database, such as a fresh `supabase db reset`, ticks and does nothing.
  if v_base is null or v_key is null then
    return;
  end if;

  -- Two minutes, against a pg_net default of five seconds that timed out on every working tick.
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

-- Scheduler only. The function reads a service role key from Vault and calls any named worker.
revoke all on function public.invoke_worker(text, integer)
  from public, anon, authenticated, service_role;

-- The whole schedule in one function. `cron.schedule` upserts on job name, so re-running is safe.
create or replace function public.schedule_workers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Every two minutes. claim_ingest_jobs derives its fifteen-minute reclaim window from this.
  perform cron.schedule(
    'ingest-worker', '*/2 * * * *',
    $job$select public.invoke_worker('ingest-worker', 25)$job$
  );

  perform cron.schedule(
    'sync-worker', '0 * * * *',
    $job$select public.invoke_worker('sync-worker', 10)$job$
  );

  -- 02:00 UTC. The dream job staggers by organization id, so tenants wake on different minutes.
  perform cron.schedule(
    'dream-worker', '0 2 * * *',
    $job$select public.invoke_worker('dream-worker', 5)$job$
  );
end;
$$;

revoke all on function public.schedule_workers()
  from public, anon, authenticated, service_role;

-- Apply it. A later change to the schedule is a new migration calling the same function.
select public.schedule_workers();
