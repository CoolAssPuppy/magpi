-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.claim_ingest_jobs (
  p_limit integer
)
  RETURNS SETOF public.ingest_jobs
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Requeue a job whose worker never came back, using claimed_at, without counting an attempt.
  with reclaimed as (
    update public.ingest_jobs
    set status = 'queued'
    where status = 'running'
      and claimed_at < now() - interval '15 minutes'
    returning id
  ),
  -- Fail what the claim is about to skip, so a poison job does not sit at 'queued' forever.
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
      -- Three, because most ingest failures are deterministic and a fourth try pays to repeat one.
      and c.attempts < 3
    order by c.created_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning j.*;
$function$;

CREATE OR REPLACE FUNCTION public.invoke_worker (
  p_worker text,
  p_batch  integer
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_base text;
  v_key text;
begin
  select decrypted_secret into v_base
  from vault.decrypted_secrets where name = 'worker_base_url';

  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'worker_service_key';

  -- A database nobody has configured ticks and does nothing.
  if v_base is null or v_key is null then
    return;
  end if;

  -- Two minutes, against a pg_net default of five seconds that timed out on every busy tick.
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

  -- 02:00 UTC. The dream job staggers by organization id itself.
  perform cron.schedule(
    'dream-worker', '0 2 * * *',
    $job$select public.invoke_worker('dream-worker', 5)$job$
  );
end;
$function$;

-- Until a vector operation has run in the session, setting hnsw.iterative_scan is refused.
do $warmup$
begin
  perform '[1]'::extensions.vector;
end;
$warmup$;

CREATE OR REPLACE FUNCTION public.search (
  query_embedding extensions.vector,
  query_text      text,
  space_filter    uuid[]            DEFAULT NULL::uuid[],
  match_count     integer           DEFAULT 20
)
  RETURNS TABLE (
    chunk_id    uuid,
    document_id uuid,
    space_id    uuid,
    content     text,
    score       real
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'extensions'
  SET "hnsw.iterative_scan" TO 'relaxed_order'
  AS $function$
  with
    -- Over-fetch each arm, because RRF only reorders what it is given.
    candidate_depth as (select greatest(match_count * 4, 40) as n),
    semantic as (
      select
        c.id,
        c.document_id,
        c.space_id,
        c.content,
        row_number() over (order by c.embedding <=> query_embedding) as rank
      from public.chunks c, candidate_depth d
      where c.embedding is not null
        and (space_filter is null or c.space_id = any (space_filter))
      order by c.embedding <=> query_embedding
      limit (select n from candidate_depth)
    ),
    lexical as (
      select
        c.id,
        c.document_id,
        c.space_id,
        c.content,
        row_number() over (
          order by ts_rank_cd(c.tsv, websearch_to_tsquery('english', query_text)) desc
        ) as rank
      from public.chunks c
      where query_text is not null
        and query_text <> ''
        and c.tsv @@ websearch_to_tsquery('english', query_text)
        and (space_filter is null or c.space_id = any (space_filter))
      order by ts_rank_cd(c.tsv, websearch_to_tsquery('english', query_text)) desc
      limit (select n from candidate_depth)
    ),
    fused as (
      select
        coalesce(s.id, l.id) as chunk_id,
        coalesce(s.document_id, l.document_id) as document_id,
        coalesce(s.space_id, l.space_id) as space_id,
        coalesce(s.content, l.content) as content,
        -- k = 60 is the constant from the original RRF paper, so no per-corpus tuning.
        (coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + l.rank), 0))::real as score
      from semantic s
      full outer join lexical l on l.id = s.id
    )
  select chunk_id, document_id, space_id, content, score
  from fused
  order by score desc
  limit match_count;
$function$;