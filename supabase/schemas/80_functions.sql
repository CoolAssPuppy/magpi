-- The one visibility predicate. Every content policy calls it, so there is a
-- single place where "what can this person see" is decided.
create or replace function public.visible_space_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.space_members where user_id = (select auth.uid())
$$;

-- Revoking from PUBLIC removes execute from every role not granted it
-- explicitly, service_role included, so each grant below is required and not
-- merely tidiness. `supabase db diff` emits grants and never revokes, so a
-- revoke that lives only in a migration is gone the next time this file is the
-- one that builds the shadow database. anon has no surface in this product.
revoke all on function public.visible_space_ids() from public, anon;
grant execute on function public.visible_space_ids() to authenticated, service_role;

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = (select auth.uid())
  )
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  )
$$;

revoke all on function public.is_org_admin(uuid) from public, anon;
grant execute on function public.is_org_admin(uuid) to authenticated, service_role;

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = (select auth.uid())
  )
$$;

revoke all on function public.is_space_member(uuid) from public, anon;
grant execute on function public.is_space_member(uuid) to authenticated, service_role;

-- Hybrid retrieval: pgvector similarity plus Postgres full text search, merged
-- with reciprocal rank fusion.
--
-- security invoker, so RLS on chunks applies to whoever calls it. Web, mobile and
-- the MCP server all call this one function. A second search implementation
-- anywhere is a bug.
--
-- Pure vector search fails visibly on exact-match questions like "what is the SSO
-- ticket number". The lexical arm is what stops that happening on stage.
create or replace function public.search(
  query_embedding extensions.vector(1536),
  query_text text,
  space_filter uuid[] default null,
  match_count integer default 20
)
returns table (
  chunk_id uuid,
  document_id uuid,
  space_id uuid,
  content text,
  score real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with
    -- Over-fetch each arm so fusion has something to rank. RRF only reorders
    -- what it is given.
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
        -- k = 60 is the constant from the original RRF paper. It damps the
        -- contribution of low-ranked hits without tuning per corpus.
        (coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + l.rank), 0))::real as score
      from semantic s
      full outer join lexical l on l.id = s.id
    )
  select chunk_id, document_id, space_id, content, score
  from fused
  order by score desc
  limit match_count;
$$;

-- Without this, a filtered vector search returns nothing at all rather than
-- fewer rows. The HNSW scan takes its ef_search nearest neighbours and only then
-- does RLS discard them, so a caller whose own chunks all rank below a thousand
-- they cannot see gets an empty answer to a question their own document answers.
-- pgTAP measured it: 0 of 5 with the setting off, 5 of 5 with it on.
--
-- It goes on the function rather than the role or the database so it travels to
-- web, mobile and the MCP server together. relaxed_order because search()
-- re-ranks with reciprocal rank fusion afterwards, so scan order buys nothing.
--
-- The cast above the ALTER is required, not decorative. Until a vector operation
-- has run in the session, hnsw.iterative_scan is an unrecognised placeholder and
-- the ALTER is refused with "permission denied to set parameter".
do $$
begin
  perform '[1]'::extensions.vector;
end;
$$;

alter function public.search(extensions.vector, text, uuid[], integer)
  set hnsw.iterative_scan = relaxed_order;

revoke all on function public.search(extensions.vector, text, uuid[], integer) from public, anon;
grant execute on function public.search(extensions.vector, text, uuid[], integer)
  to authenticated, service_role;

-- Atomically consumes a state row, returning it only if it exists and has not
-- expired. Delete-and-return in one statement so two concurrent callbacks with
-- the same state cannot both succeed.
create or replace function public.consume_oauth_state(p_state text)
returns table (user_id uuid, provider text, code_verifier text, space_id uuid, return_to text)
language sql
security definer
set search_path = ''
as $$
  delete from public.oauth_states
  where state = p_state and expires_at > clock_timestamp()
  returning user_id, provider, code_verifier, space_id, return_to;
$$;

revoke all on function public.consume_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_oauth_state(text) to service_role;

create or replace function public.prune_oauth_states()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.oauth_states where expires_at < clock_timestamp();
$$;

revoke all on function public.prune_oauth_states() from public, anon, authenticated;
grant execute on function public.prune_oauth_states() to service_role;

-- Deliberately does not filter on user id. The caller compares and audits the
-- mismatch, which is the signal that someone was handed a link they did not
-- start. Filtering here would make an attack look like an expired ticket.
create or replace function public.consume_pending_connection(p_ticket_hash text)
returns table (
  user_id uuid,
  provider text,
  space_id uuid,
  external_account_id text,
  access_token_enc bytea,
  refresh_token_enc bytea,
  scopes text[],
  token_expires_at timestamptz,
  return_to text
)
language sql
security definer
set search_path = ''
as $$
  delete from public.pending_connections
  where ticket_hash = p_ticket_hash and expires_at > clock_timestamp()
  returning user_id, provider, space_id, external_account_id, access_token_enc,
            refresh_token_enc, scopes, token_expires_at, return_to;
$$;

revoke all on function public.consume_pending_connection(text) from public, anon, authenticated;
grant execute on function public.consume_pending_connection(text) to service_role;

create or replace function public.prune_pending_connections()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.pending_connections where expires_at <= clock_timestamp();
$$;

revoke all on function public.prune_pending_connections() from public, anon, authenticated;
grant execute on function public.prune_pending_connections() to service_role;

-- The insert-on-conflict-update is one atomic statement, so concurrent callers
-- cannot both observe count < limit and both proceed.
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_s integer
)
returns table (allowed boolean, remaining integer, retry_after_s integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_s) * p_window_s
  );

  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start)
    do update set count = public.rate_limits.count + 1
  returning public.rate_limits.count into v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    greatest(
      1,
      ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_s))
                              - clock_timestamp()))::integer
    );
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

create or replace function public.prune_rate_limits()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limits where window_start < clock_timestamp() - interval '1 day';
$$;

revoke all on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;

-- Claims queued ingest jobs atomically.
--
-- The worker used to select queued rows and then update them to running, which
-- is a read rather than a claim: two concurrent invocations select the same rows
-- and both process them. The document is embedded twice, the model bill is paid
-- twice, and the second writer collides on chunks (document_id, ordinal).
--
-- `for update skip locked` is what makes it a claim. Two callers running at the
-- same instant get disjoint sets, and neither waits on the other.
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

revoke all on function public.claim_ingest_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_ingest_jobs(integer) to service_role;

-- Plan limits live in the database, not the client. An ingest job that would
-- take an org past its plan is refused here.
create or replace function public.plan_document_limit(p_plan public.org_plan)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'free' then 200
    when 'team' then 25000
    when 'enterprise' then 1000000
  end;
$$;

revoke all on function public.plan_document_limit(public.org_plan) from public, anon;
grant execute on function public.plan_document_limit(public.org_plan) to authenticated, service_role;

create or replace function public.plan_monthly_query_limit(p_plan public.org_plan)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'free' then 500
    when 'team' then 50000
    when 'enterprise' then 5000000
  end;
$$;

revoke all on function public.plan_monthly_query_limit(public.org_plan) from public, anon;
grant execute on function public.plan_monthly_query_limit(public.org_plan)
  to authenticated, service_role;

create or replace function public.check_ingest_allowed(p_org_id uuid)
returns table (allowed boolean, reason text, used bigint, plan_limit integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.org_plan;
  v_limit integer;
  v_used bigint;
begin
  select plan into v_plan from public.organizations where id = p_org_id;
  if v_plan is null then
    return query select false, 'organization not found'::text, 0::bigint, 0;
    return;
  end if;

  v_limit := public.plan_document_limit(v_plan);
  select count(*) into v_used from public.documents where org_id = p_org_id;

  if v_used >= v_limit then
    return query select false, format('document limit reached for %s plan', v_plan), v_used, v_limit;
  else
    return query select true, null::text, v_used, v_limit;
  end if;
end;
$$;

revoke all on function public.check_ingest_allowed(uuid) from public, anon;
grant execute on function public.check_ingest_allowed(uuid) to authenticated, service_role;

-- The same gate for questions. plan_monthly_query_limit was read by the usage
-- panel and enforced by nothing, so a free organization could ask 500,000
-- questions against a 500 limit and the only sign was a number on a screen an
-- admin might never open.
--
-- The window is the calendar month in UTC, which is what the usage panel already
-- sums over. Billing periods do not line up with calendar months, and when they
-- need to this reads the period off the subscription instead.
create or replace function public.check_query_allowed(p_org_id uuid)
returns table (allowed boolean, reason text, used bigint, plan_limit integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.org_plan;
  v_limit integer;
  v_used bigint;
begin
  select plan into v_plan from public.organizations where id = p_org_id;
  if v_plan is null then
    return query select false, 'organization not found'::text, 0::bigint, 0;
    return;
  end if;

  v_limit := public.plan_monthly_query_limit(v_plan);

  select coalesce(sum(quantity), 0) into v_used
  from public.usage_events
  where org_id = p_org_id
    and kind = 'query'
    and occurred_at >= date_trunc('month', now() at time zone 'utc');

  if v_used >= v_limit then
    return query select false, format('question limit reached for %s plan', v_plan), v_used, v_limit;
  else
    return query select true, null::text, v_used, v_limit;
  end if;
end;
$$;

revoke all on function public.check_query_allowed(uuid) from public, anon;
grant execute on function public.check_query_allowed(uuid) to authenticated, service_role;

-- What the admin dead-content panel reads. Both columns existed from the first
-- migration and nothing ever wrote either, so the panel reported every document
-- in the organization as never retrieved and the number was the document count.
--
-- Security definer because a reader holds no update grant on documents, and
-- scoped to their own visible spaces for the same reason the grant is absent:
-- otherwise any signed-in user could mark another organization's documents as
-- freshly read and hide them from that organization's own panel.
--
-- The count is bumped once per search that returned the document, not once per
-- chunk, so a document that matched five chunks counts as one retrieval.
create or replace function public.record_retrieval(p_document_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.documents
  set last_retrieved_at = now(),
      retrieval_count = retrieval_count + 1
  where id = any(p_document_ids)
    and space_id in (select public.visible_space_ids());
$$;

revoke all on function public.record_retrieval(uuid[]) from public, anon;
grant execute on function public.record_retrieval(uuid[]) to authenticated, service_role;

-- Every new user gets an organization and a personal space. Doing it in a trigger
-- means there is no signed-in state where a user has nowhere to put a document.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_slug text;
  v_label text;
begin
  v_label := coalesce(nullif(split_part(new.email, '@', 1), ''), 'workspace');
  v_slug := regexp_replace(lower(v_label), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if char_length(v_slug) < 2 then
    v_slug := 'workspace';
  end if;
  v_slug := left(v_slug, 40) || '-' || left(replace(new.id::text, '-', ''), 8);

  insert into public.organizations (name, slug)
  values (v_label || '''s workspace', v_slug)
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role) values (v_org_id, new.id, 'owner');

  insert into public.spaces (org_id, kind, name, owner_user_id)
  values (v_org_id, 'personal', 'Personal', new.id);

  insert into public.spaces (org_id, kind, name)
  values (v_org_id, 'org', 'Everyone');

  insert into public.space_members (space_id, user_id)
  select id, new.id from public.spaces where org_id = v_org_id;

  return new;
end;
$$;

-- A trigger function is invoked by the trigger and runs as the table owner, so
-- no role needs execute to make it fire and the default grant to PUBLIC only
-- lets a caller run it by hand.
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Joining an org gets you the org space. Leaving it takes the org space away.
create or replace function public.sync_org_space_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.space_members (space_id, user_id)
    select s.id, new.user_id
    from public.spaces s
    where s.org_id = new.org_id and s.kind = 'org'
    on conflict do nothing;
    return new;
  end if;

  delete from public.space_members sm
  using public.spaces s
  where sm.space_id = s.id and s.org_id = old.org_id and sm.user_id = old.user_id;
  return old;
end;
$$;

revoke all on function public.sync_org_space_membership() from public, anon, authenticated;

create or replace trigger org_members_sync_org_space
  after insert or delete on public.org_members
  for each row execute function public.sync_org_space_membership();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;

create or replace trigger connections_touch_updated_at
  before update on public.connections
  for each row execute function public.touch_updated_at();

create or replace trigger documents_touch_updated_at
  before update on public.documents
  for each row execute function public.touch_updated_at();

create or replace trigger ingest_jobs_touch_updated_at
  before update on public.ingest_jobs
  for each row execute function public.touch_updated_at();

create or replace trigger conversations_touch_updated_at
  before update on public.conversations
  for each row execute function public.touch_updated_at();
