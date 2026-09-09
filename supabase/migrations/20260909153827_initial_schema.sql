-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE EXTENSION pg_trgm WITH SCHEMA extensions;

CREATE EXTENSION vector WITH SCHEMA extensions;

CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog;

CREATE TYPE public.connection_status AS ENUM (
  'active',
  'syncing',
  'error',
  'revoked',
  'expired'
);

CREATE TYPE public.document_origin AS ENUM (
  'upload',
  'sync',
  'dream'
);

CREATE TYPE public.dream_kind AS ENUM (
  'entities',
  'digest',
  'connections'
);

CREATE TYPE public.dream_status AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'timeout'
);

CREATE TYPE public.entity_kind AS ENUM (
  'person',
  'project',
  'customer',
  'decision'
);

CREATE TYPE public.ingest_stage AS ENUM (
  'fetch',
  'extract',
  'chunk',
  'embed',
  'store'
);

CREATE TYPE public.ingest_status AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'timeout'
);

CREATE TYPE public.message_role AS ENUM (
  'user',
  'assistant'
);

CREATE TYPE public.org_plan AS ENUM (
  'free',
  'team',
  'enterprise'
);

CREATE TYPE public.org_role AS ENUM (
  'owner',
  'admin',
  'member'
);

CREATE TYPE public.space_kind AS ENUM (
  'personal',
  'team',
  'org'
);

CREATE TYPE public.usage_kind AS ENUM (
  'document_ingested',
  'chunk_embedded',
  'query',
  'dream_run',
  'embedding_tokens',
  'chat_tokens'
);

CREATE FUNCTION public.check_ingest_allowed (
  p_org_id uuid
)
  RETURNS TABLE (
    allowed    boolean,
    reason     text,
    used       bigint,
    plan_limit integer
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.check_ingest_allowed(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.check_ingest_allowed(uuid) TO service_role;

CREATE FUNCTION public.consume_oauth_state (
  p_state text
)
  RETURNS TABLE (
    user_id       uuid,
    provider      text,
    code_verifier text,
    space_id      uuid,
    return_to     text
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  delete from public.oauth_states
  where state = p_state and expires_at > clock_timestamp()
  returning user_id, provider, code_verifier, space_id, return_to;
$function$;

GRANT ALL ON FUNCTION public.consume_oauth_state(text) TO service_role;

CREATE FUNCTION public.consume_pending_connection (
  p_ticket_hash text
)
  RETURNS TABLE (
    user_id             uuid,
    provider            text,
    space_id            uuid,
    external_account_id text,
    access_token_enc    bytea,
    refresh_token_enc   bytea,
    scopes              text[],
    token_expires_at    timestamp with time zone,
    return_to           text
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  delete from public.pending_connections
  where ticket_hash = p_ticket_hash and expires_at > clock_timestamp()
  returning user_id, provider, space_id, external_account_id, access_token_enc,
            refresh_token_enc, scopes, token_expires_at, return_to;
$function$;

GRANT ALL ON FUNCTION public.consume_pending_connection(text) TO service_role;

CREATE FUNCTION public.consume_rate_limit (
  p_bucket   text,
  p_limit    integer,
  p_window_s integer
)
  RETURNS TABLE (
    allowed       boolean,
    remaining     integer,
    retry_after_s integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

CREATE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE FUNCTION public.is_org_admin (
  p_org_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  )
$function$;

GRANT ALL ON FUNCTION public.is_org_admin(uuid) TO authenticated;

CREATE FUNCTION public.is_org_member (
  p_org_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = (select auth.uid())
  )
$function$;

GRANT ALL ON FUNCTION public.is_org_member(uuid) TO authenticated;

CREATE FUNCTION public.is_space_member (
  p_space_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = (select auth.uid())
  )
$function$;

GRANT ALL ON FUNCTION public.is_space_member(uuid) TO authenticated;

CREATE FUNCTION public.plan_document_limit (
  p_plan public.org_plan
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case p_plan
    when 'free' then 200
    when 'team' then 25000
    when 'enterprise' then 1000000
  end;
$function$;

GRANT ALL ON FUNCTION public.plan_document_limit(public.org_plan) TO authenticated;

GRANT ALL ON FUNCTION public.plan_document_limit(public.org_plan) TO service_role;

CREATE FUNCTION public.plan_monthly_query_limit (
  p_plan public.org_plan
)
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case p_plan
    when 'free' then 500
    when 'team' then 50000
    when 'enterprise' then 5000000
  end;
$function$;

GRANT ALL ON FUNCTION public.plan_monthly_query_limit(public.org_plan) TO authenticated;

GRANT ALL ON FUNCTION public.plan_monthly_query_limit(public.org_plan) TO service_role;

CREATE FUNCTION public.prune_oauth_states()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  delete from public.oauth_states where expires_at < clock_timestamp();
$function$;

GRANT ALL ON FUNCTION public.prune_oauth_states() TO service_role;

CREATE FUNCTION public.prune_pending_connections()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  delete from public.pending_connections where expires_at <= clock_timestamp();
$function$;

GRANT ALL ON FUNCTION public.prune_pending_connections() TO service_role;

CREATE FUNCTION public.prune_rate_limits()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  delete from public.rate_limits where window_start < clock_timestamp() - interval '1 day';
$function$;

GRANT ALL ON FUNCTION public.prune_rate_limits() TO service_role;

CREATE FUNCTION public.search (
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
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.search(extensions.vector, text, uuid[], integer) TO authenticated;

CREATE FUNCTION public.sync_org_space_membership()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE FUNCTION public.touch_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE FUNCTION public.visible_space_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select space_id from public.space_members where user_id = (select auth.uid())
$function$;

GRANT ALL ON FUNCTION public.visible_space_ids() TO authenticated;

CREATE TABLE public.chunks (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id      uuid                     NOT NULL,
  space_id    uuid                     NOT NULL,
  document_id uuid                     NOT NULL,
  ordinal     integer                  NOT NULL,
  content     text                     NOT NULL,
  embedding   extensions.vector(1536),
  tsv         tsvector                 GENERATED ALWAYS AS (to_tsvector('english'::regconfig, content)) STORED,
  token_count integer,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.chunks
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chunks
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.chunks
  ADD CONSTRAINT chunks_document_id_ordinal_key UNIQUE (document_id, ordinal);

ALTER TABLE public.chunks
  ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.chunks TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.chunks TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.chunks TO service_role;

CREATE INDEX chunks_document_id_idx ON public.chunks (document_id);

CREATE INDEX chunks_embedding_idx ON public.chunks USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m='16', ef_construction='64');

CREATE INDEX chunks_space_id_idx ON public.chunks (space_id);

CREATE INDEX chunks_tsv_idx ON public.chunks USING gin (tsv);

CREATE POLICY chunks_select_visible ON public.chunks
  FOR SELECT
  TO authenticated
  USING ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE TABLE public.connections (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id              uuid                     NOT NULL,
  space_id            uuid                     NOT NULL,
  user_id             uuid                     NOT NULL,
  provider            text                     NOT NULL,
  external_account_id text,
  access_token_enc    bytea,
  refresh_token_enc   bytea,
  scopes              text[]                   DEFAULT '{}'::text[] NOT NULL,
  scope_selection     jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  status              public.connection_status DEFAULT 'active'::public.connection_status NOT NULL,
  status_detail       text,
  cursor              text,
  token_expires_at    timestamp with time zone,
  last_synced_at      timestamp with time zone,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.connections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.connections
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.connections
  ADD CONSTRAINT connections_pkey PRIMARY KEY (id);

ALTER TABLE public.connections
  ADD CONSTRAINT connections_scope_selection_is_object CHECK (jsonb_typeof(scope_selection) = 'object'::text);

ALTER TABLE public.connections
  ADD CONSTRAINT connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.connections TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.connections TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.connections TO service_role;

CREATE INDEX connections_space_id_idx ON public.connections (space_id);

CREATE INDEX connections_user_id_idx ON public.connections (user_id);

CREATE INDEX connections_org_id_idx ON public.connections (org_id);

CREATE TRIGGER connections_touch_updated_at
  BEFORE UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY connections_delete_owner ON public.connections
  FOR DELETE
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND (space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids))));

CREATE POLICY connections_select_visible ON public.connections
  FOR SELECT
  TO authenticated
  USING ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE TABLE public.conversations (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id       uuid                     NOT NULL,
  user_id      uuid                     NOT NULL,
  space_filter uuid[],
  title        text,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.conversations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversations
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversations TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversations TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.conversations TO service_role;

CREATE INDEX conversations_user_created_idx ON public.conversations (user_id, created_at DESC);

CREATE TRIGGER conversations_touch_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY conversations_delete_own ON public.conversations
  FOR DELETE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY conversations_insert_own ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND public.is_org_member(org_id)));

CREATE POLICY conversations_select_own ON public.conversations
  FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY conversations_update_own ON public.conversations
  FOR UPDATE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.documents (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id            uuid                     NOT NULL,
  space_id          uuid                     NOT NULL,
  connection_id     uuid,
  external_id       text,
  title             text                     DEFAULT 'Untitled'::text NOT NULL,
  url               text,
  mime_type         text,
  storage_path      text,
  content_hash      text,
  origin            public.document_origin   NOT NULL,
  version           integer                  DEFAULT 1 NOT NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  updated_at        timestamp with time zone DEFAULT now() NOT NULL,
  dream_run_id      uuid,
  last_retrieved_at timestamp with time zone,
  retrieval_count   bigint                   DEFAULT 0 NOT NULL
);

ALTER TABLE public.documents
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.documents
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE SET NULL;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

ALTER TABLE public.chunks
  ADD CONSTRAINT chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.documents TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.documents TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.documents TO service_role;

CREATE INDEX documents_org_id_idx ON public.documents (org_id);

CREATE INDEX documents_dead_content_idx ON public.documents (org_id, last_retrieved_at);

CREATE INDEX documents_origin_idx ON public.documents (space_id, origin);

CREATE UNIQUE INDEX documents_connection_external_idx ON public.documents (connection_id, external_id)
  WHERE connection_id IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX documents_space_id_idx ON public.documents (space_id);

CREATE TRIGGER documents_touch_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY documents_delete_dream ON public.documents
  FOR DELETE
  TO authenticated
  USING (((origin = 'dream'::public.document_origin) AND (space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids))));

CREATE POLICY documents_select_visible ON public.documents
  FOR SELECT
  TO authenticated
  USING ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE TABLE public.dream_links (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  dream_run_id uuid                     NOT NULL,
  space_id     uuid                     NOT NULL,
  document_a   uuid                     NOT NULL,
  document_b   uuid                     NOT NULL,
  similarity   real                     NOT NULL,
  rationale    text,
  confirmed_at timestamp with time zone,
  dismissed_at timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.dream_links
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dream_links
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dream_links
  ADD CONSTRAINT dream_links_check CHECK (document_a < document_b);

ALTER TABLE public.dream_links
  ADD CONSTRAINT dream_links_document_a_fkey FOREIGN KEY (document_a) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE public.dream_links
  ADD CONSTRAINT dream_links_document_b_fkey FOREIGN KEY (document_b) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE public.dream_links
  ADD CONSTRAINT dream_links_pkey PRIMARY KEY (id);

ALTER TABLE public.dream_links
  ADD CONSTRAINT dream_links_space_id_document_a_document_b_key UNIQUE (space_id, document_a, document_b);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.dream_links TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.dream_links TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.dream_links TO service_role;

CREATE INDEX dream_links_space_idx ON public.dream_links (space_id, created_at DESC);

CREATE POLICY dream_links_select_visible ON public.dream_links
  FOR SELECT
  TO authenticated
  USING ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE POLICY dream_links_update_visible ON public.dream_links
  FOR UPDATE
  TO authenticated
  USING ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)))
  WITH CHECK ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE TABLE public.dream_runs (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id               uuid                     NOT NULL,
  space_id             uuid                     NOT NULL,
  kind                 public.dream_kind        NOT NULL,
  status               public.dream_status      DEFAULT 'queued'::public.dream_status NOT NULL,
  started_at           timestamp with time zone,
  finished_at          timestamp with time zone,
  input_document_count integer                  DEFAULT 0 NOT NULL,
  output_document_id   uuid,
  error                text,
  triggered_by         uuid,
  created_at           timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.dream_runs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dream_runs
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dream_runs
  ADD CONSTRAINT dream_runs_output_document_id_fkey FOREIGN KEY (output_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

ALTER TABLE public.dream_runs
  ADD CONSTRAINT dream_runs_pkey PRIMARY KEY (id);

ALTER TABLE public.dream_links
  ADD CONSTRAINT dream_links_dream_run_id_fkey FOREIGN KEY (dream_run_id) REFERENCES public.dream_runs(id) ON DELETE CASCADE;

ALTER TABLE public.dream_runs
  ADD CONSTRAINT dream_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.dream_runs TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.dream_runs TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.dream_runs TO service_role;

CREATE INDEX dream_runs_space_created_idx ON public.dream_runs (space_id, created_at DESC);

CREATE POLICY dream_runs_select_visible ON public.dream_runs
  FOR SELECT
  TO authenticated
  USING ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE TABLE public.entities (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id         uuid                     NOT NULL,
  space_id       uuid                     NOT NULL,
  kind           public.entity_kind       NOT NULL,
  name           text                     NOT NULL,
  canonical_name text                     NOT NULL,
  summary        text,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  updated_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.entities
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.entities
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.entities
  ADD CONSTRAINT entities_pkey PRIMARY KEY (id);

ALTER TABLE public.entities
  ADD CONSTRAINT entities_space_id_kind_canonical_name_key UNIQUE (space_id, kind, canonical_name);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entities TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entities TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entities TO service_role;

CREATE INDEX entities_space_id_idx ON public.entities (space_id);

CREATE POLICY entities_select_visible ON public.entities
  FOR SELECT
  TO authenticated
  USING ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE TABLE public.entity_mentions (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  entity_id   uuid                     NOT NULL,
  document_id uuid                     NOT NULL,
  chunk_id    uuid                     NOT NULL,
  space_id    uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.entity_mentions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.entity_mentions
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.entity_mentions
  ADD CONSTRAINT entity_mentions_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES public.chunks(id) ON DELETE CASCADE;

ALTER TABLE public.entity_mentions
  ADD CONSTRAINT entity_mentions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE public.entity_mentions
  ADD CONSTRAINT entity_mentions_entity_id_chunk_id_key UNIQUE (entity_id, chunk_id);

ALTER TABLE public.entity_mentions
  ADD CONSTRAINT entity_mentions_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;

ALTER TABLE public.entity_mentions
  ADD CONSTRAINT entity_mentions_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entity_mentions TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entity_mentions TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entity_mentions TO service_role;

CREATE INDEX entity_mentions_document_idx ON public.entity_mentions (document_id);

CREATE INDEX entity_mentions_space_id_idx ON public.entity_mentions (space_id);

CREATE POLICY entity_mentions_select_visible ON public.entity_mentions
  FOR SELECT
  TO authenticated
  USING ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE TABLE public.ingest_jobs (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id        uuid                     NOT NULL,
  space_id      uuid                     NOT NULL,
  document_id   uuid                     NOT NULL,
  connection_id uuid,
  stage         public.ingest_stage      DEFAULT 'fetch'::public.ingest_stage NOT NULL,
  attempts      integer                  DEFAULT 0 NOT NULL,
  status        public.ingest_status     DEFAULT 'queued'::public.ingest_status NOT NULL,
  error         text,
  claimed_at    timestamp with time zone,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.ingest_jobs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ingest_jobs
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ingest_jobs
  ADD CONSTRAINT ingest_jobs_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;

ALTER TABLE public.ingest_jobs
  ADD CONSTRAINT ingest_jobs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE public.ingest_jobs
  ADD CONSTRAINT ingest_jobs_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.ingest_jobs TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.ingest_jobs TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.ingest_jobs TO service_role;

CREATE INDEX ingest_jobs_document_idx ON public.ingest_jobs (document_id);

CREATE INDEX ingest_jobs_claim_idx ON public.ingest_jobs (status, created_at)
  WHERE status = 'queued'::public.ingest_status;

CREATE INDEX ingest_jobs_space_idx ON public.ingest_jobs (space_id, updated_at DESC);

CREATE TRIGGER ingest_jobs_touch_updated_at
  BEFORE UPDATE ON public.ingest_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY ingest_jobs_select_visible ON public.ingest_jobs
  FOR SELECT
  TO authenticated
  USING ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE TABLE public.messages (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid                     NOT NULL,
  role            public.message_role      NOT NULL,
  content         text                     DEFAULT ''::text NOT NULL,
  citations       jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  latency_ms      integer,
  token_count     integer,
  condensed_query text,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.messages
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_citations_is_array CHECK (jsonb_typeof(citations) = 'array'::text);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.messages TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.messages TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.messages TO service_role;

CREATE INDEX messages_conversation_created_idx ON public.messages (conversation_id, created_at);

CREATE POLICY messages_insert_own ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY messages_select_own ON public.messages
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));

CREATE TABLE public.model_calls (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id        uuid                     NOT NULL,
  purpose       text                     NOT NULL,
  model         text                     NOT NULL,
  input_tokens  integer                  DEFAULT 0 NOT NULL,
  output_tokens integer                  DEFAULT 0 NOT NULL,
  latency_ms    integer                  DEFAULT 0 NOT NULL,
  succeeded     boolean                  DEFAULT true NOT NULL,
  occurred_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.model_calls
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.model_calls
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.model_calls
  ADD CONSTRAINT model_calls_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.model_calls TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.model_calls TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.model_calls TO service_role;

CREATE INDEX model_calls_org_occurred_idx ON public.model_calls (org_id, occurred_at);

CREATE POLICY model_calls_select_admin ON public.model_calls
  FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));

CREATE TABLE public.oauth_states (
  state         text                     NOT NULL,
  user_id       uuid                     NOT NULL,
  provider      text                     NOT NULL,
  code_verifier text                     NOT NULL,
  space_id      uuid                     NOT NULL,
  return_to     text,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  expires_at    timestamp with time zone NOT NULL
);

ALTER TABLE public.oauth_states
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.oauth_states
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.oauth_states
  ADD CONSTRAINT oauth_states_pkey PRIMARY KEY (state);

ALTER TABLE public.oauth_states
  ADD CONSTRAINT oauth_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.oauth_states TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.oauth_states TO authenticated;

GRANT ALL ON public.oauth_states TO service_role;

CREATE INDEX oauth_states_expires_idx ON public.oauth_states (expires_at);

CREATE TABLE public.org_invites (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id      uuid                     NOT NULL,
  email       text                     NOT NULL,
  role        public.org_role          DEFAULT 'member'::public.org_role NOT NULL,
  token_hash  text                     NOT NULL,
  invited_by  uuid                     NOT NULL,
  expires_at  timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.org_invites
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.org_invites
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_email_check CHECK (POSITION(('@'::text) IN (email)) > 1);

ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_pkey PRIMARY KEY (id);

ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_token_hash_key UNIQUE (token_hash);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_invites TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_invites TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_invites TO service_role;

CREATE UNIQUE INDEX org_invites_pending_idx ON public.org_invites (org_id, lower(email))
  WHERE accepted_at IS NULL;

CREATE POLICY org_invites_delete_admin ON public.org_invites
  FOR DELETE
  TO authenticated
  USING (public.is_org_admin(org_id));

CREATE POLICY org_invites_insert_admin ON public.org_invites
  FOR INSERT
  TO authenticated
  WITH CHECK ((public.is_org_admin(org_id) AND (invited_by = ( SELECT auth.uid() AS uid))));

CREATE POLICY org_invites_select_admin ON public.org_invites
  FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));

CREATE TABLE public.org_members (
  org_id     uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  role       public.org_role          DEFAULT 'member'::public.org_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.org_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.org_members
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_pkey PRIMARY KEY (org_id, user_id);

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_members TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_members TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_members TO service_role;

CREATE INDEX org_members_user_id_idx ON public.org_members (user_id);

CREATE TRIGGER org_members_sync_org_space
  AFTER INSERT OR DELETE ON public.org_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_org_space_membership();

CREATE POLICY org_members_delete_admin ON public.org_members
  FOR DELETE
  TO authenticated
  USING ((public.is_org_admin(org_id) AND (user_id <> ( SELECT auth.uid() AS uid))));

CREATE POLICY org_members_select_member ON public.org_members
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE TABLE public.organizations (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name                   text                     NOT NULL,
  slug                   text                     NOT NULL,
  plan                   public.org_plan          DEFAULT 'free'::public.org_plan NOT NULL,
  stripe_customer_id     text,
  stripe_subscription_id text,
  seats                  integer                  DEFAULT 1 NOT NULL,
  created_at             timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.organizations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_name_check CHECK (char_length(name) >= 1 AND char_length(name) <= 120);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE public.chunks
  ADD CONSTRAINT chunks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.connections
  ADD CONSTRAINT connections_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.dream_runs
  ADD CONSTRAINT dream_runs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.entities
  ADD CONSTRAINT entities_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.ingest_jobs
  ADD CONSTRAINT ingest_jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.model_calls
  ADD CONSTRAINT model_calls_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_seats_check CHECK (seats >= 1);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'::text);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_slug_key UNIQUE (slug);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_stripe_customer_id_key UNIQUE (stripe_customer_id);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_stripe_subscription_id_key UNIQUE (stripe_subscription_id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations TO service_role;

CREATE POLICY organizations_select_member ON public.organizations
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(id));

CREATE POLICY organizations_update_admin ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

CREATE TABLE public.pending_connections (
  ticket_hash         text                     NOT NULL,
  user_id             uuid                     NOT NULL,
  provider            text                     NOT NULL,
  space_id            uuid                     NOT NULL,
  external_account_id text,
  access_token_enc    bytea                    NOT NULL,
  refresh_token_enc   bytea,
  scopes              text[]                   DEFAULT '{}'::text[] NOT NULL,
  token_expires_at    timestamp with time zone,
  return_to           text,
  expires_at          timestamp with time zone NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.pending_connections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pending_connections
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.pending_connections
  ADD CONSTRAINT pending_connections_pkey PRIMARY KEY (ticket_hash);

ALTER TABLE public.pending_connections
  ADD CONSTRAINT pending_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.pending_connections TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.pending_connections TO authenticated;

GRANT ALL ON public.pending_connections TO service_role;

CREATE INDEX pending_connections_expires_at_idx ON public.pending_connections (expires_at);

CREATE TABLE public.providers (
  slug                 text    NOT NULL,
  display_name         text    NOT NULL,
  description          text    DEFAULT ''::text NOT NULL,
  kind                 text    DEFAULT 'oauth'::text NOT NULL,
  auth_url             text,
  token_url            text,
  scopes               text[]  DEFAULT '{}'::text[] NOT NULL,
  docs_url             text,
  enabled              boolean DEFAULT false NOT NULL,
  "position"           integer DEFAULT 0 NOT NULL,
  scope_selection_kind text
);

ALTER TABLE public.providers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.providers
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.providers
  ADD CONSTRAINT providers_kind_check CHECK (kind = ANY (ARRAY['oauth'::text, 'api_key'::text]));

ALTER TABLE public.providers
  ADD CONSTRAINT providers_oauth_urls_present CHECK (kind <> 'oauth'::text OR auth_url IS NOT NULL AND token_url IS NOT NULL);

ALTER TABLE public.providers
  ADD CONSTRAINT providers_pkey PRIMARY KEY (slug);

ALTER TABLE public.connections
  ADD CONSTRAINT connections_provider_fkey FOREIGN KEY (PROVIDER) REFERENCES public.providers(slug);

ALTER TABLE public.oauth_states
  ADD CONSTRAINT oauth_states_provider_fkey FOREIGN KEY (PROVIDER) REFERENCES public.providers(slug);

ALTER TABLE public.pending_connections
  ADD CONSTRAINT pending_connections_provider_fkey FOREIGN KEY (PROVIDER) REFERENCES public.providers(slug);

ALTER TABLE public.providers
  ADD CONSTRAINT providers_scope_selection_kind_check CHECK (scope_selection_kind = ANY (ARRAY['channel'::text, 'folder'::text, 'workspace'::text]));

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.providers TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.providers TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.providers TO service_role;

CREATE POLICY providers_select_authenticated ON public.providers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.rate_limits (
  bucket       text                     NOT NULL,
  window_start timestamp with time zone NOT NULL,
  count        integer                  DEFAULT 0 NOT NULL
);

ALTER TABLE public.rate_limits
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rate_limits
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.rate_limits
  ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (bucket, window_start);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.rate_limits TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.rate_limits TO authenticated;

GRANT ALL ON public.rate_limits TO service_role;

CREATE TABLE public.space_members (
  space_id   uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.space_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.space_members
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.space_members
  ADD CONSTRAINT space_members_pkey PRIMARY KEY (space_id, user_id);

ALTER TABLE public.space_members
  ADD CONSTRAINT space_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.space_members TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.space_members TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.space_members TO service_role;

CREATE INDEX space_members_user_id_idx ON public.space_members (user_id);

CREATE POLICY space_members_select_visible ON public.space_members
  FOR SELECT
  TO authenticated
  USING ((space_id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE TABLE public.spaces (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id           uuid                     NOT NULL,
  kind             public.space_kind        NOT NULL,
  name             text                     NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  dreaming_enabled boolean                  DEFAULT true NOT NULL,
  owner_user_id    uuid
);

CREATE POLICY space_members_delete_team ON public.space_members
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.spaces s
  WHERE ((s.id = space_members.space_id) AND (s.kind = 'team'::public.space_kind) AND public.is_space_member(s.id)))));

CREATE POLICY space_members_insert_team ON public.space_members
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.spaces s
  WHERE ((s.id = space_members.space_id) AND (s.kind = 'team'::public.space_kind) AND public.is_space_member(s.id) AND (EXISTS ( SELECT 1
           FROM public.org_members m
          WHERE ((m.org_id = s.org_id) AND (m.user_id = space_members.user_id))))))));

ALTER TABLE public.spaces
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.spaces
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_name_check CHECK (char_length(name) >= 1 AND char_length(name) <= 120);

ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_personal_has_owner CHECK ((kind = 'personal'::public.space_kind) = (owner_user_id IS NOT NULL));

ALTER TABLE public.spaces
  ADD CONSTRAINT spaces_pkey PRIMARY KEY (id);

ALTER TABLE public.chunks
  ADD CONSTRAINT chunks_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.connections
  ADD CONSTRAINT connections_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.dream_links
  ADD CONSTRAINT dream_links_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.dream_runs
  ADD CONSTRAINT dream_runs_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.entities
  ADD CONSTRAINT entities_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.entity_mentions
  ADD CONSTRAINT entity_mentions_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.ingest_jobs
  ADD CONSTRAINT ingest_jobs_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.oauth_states
  ADD CONSTRAINT oauth_states_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.pending_connections
  ADD CONSTRAINT pending_connections_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

ALTER TABLE public.space_members
  ADD CONSTRAINT space_members_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.spaces TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.spaces TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.spaces TO service_role;

CREATE UNIQUE INDEX spaces_org_kind_idx ON public.spaces (org_id)
  WHERE kind = 'org'::public.space_kind;

CREATE INDEX spaces_org_id_idx ON public.spaces (org_id);

CREATE UNIQUE INDEX spaces_personal_owner_idx ON public.spaces (org_id, owner_user_id)
  WHERE kind = 'personal'::public.space_kind;

CREATE POLICY spaces_delete_admin ON public.spaces
  FOR DELETE
  TO authenticated
  USING (((kind = 'team'::public.space_kind) AND public.is_org_admin(org_id)));

CREATE POLICY spaces_insert_org_member ON public.spaces
  FOR INSERT
  TO authenticated
  WITH CHECK ((public.is_org_member(org_id) AND (kind = 'team'::public.space_kind)));

CREATE POLICY spaces_select_member ON public.spaces
  FOR SELECT
  TO authenticated
  USING ((id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE POLICY spaces_update_member ON public.spaces
  FOR UPDATE
  TO authenticated
  USING ((id IN ( SELECT public.visible_space_ids() AS visible_space_ids)))
  WITH CHECK ((id IN ( SELECT public.visible_space_ids() AS visible_space_ids)));

CREATE TABLE public.stripe_events (
  id           text                     NOT NULL,
  type         text                     NOT NULL,
  processed_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.stripe_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stripe_events
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stripe_events
  ADD CONSTRAINT stripe_events_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stripe_events TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stripe_events TO authenticated;

GRANT ALL ON public.stripe_events TO service_role;

CREATE TABLE public.usage_events (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id      uuid                     NOT NULL,
  kind        public.usage_kind        NOT NULL,
  quantity    bigint                   DEFAULT 1 NOT NULL,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.usage_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.usage_events
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.usage_events TO anon;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.usage_events TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.usage_events TO service_role;

CREATE INDEX usage_events_org_occurred_idx ON public.usage_events (org_id, occurred_at);

CREATE POLICY usage_events_select_admin ON public.usage_events
  FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));