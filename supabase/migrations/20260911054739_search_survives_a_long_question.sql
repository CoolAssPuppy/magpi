-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

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
    -- Built once. A query that cannot be built is null, and the lexical arm returns nothing.
    asked as (select public.text_search_query(query_text) as tsq),
    lexical as (
      select
        c.id,
        c.document_id,
        c.space_id,
        c.content,
        row_number() over (order by ts_rank_cd(c.tsv, a.tsq) desc) as rank
      from public.chunks c, asked a
      where a.tsq is not null
        and c.tsv @@ a.tsq
        and (space_filter is null or c.space_id = any (space_filter))
      order by ts_rank_cd(c.tsv, a.tsq) desc
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

CREATE FUNCTION public.text_search_query (
  p_text text
)
  RETURNS tsquery
  LANGUAGE plpgsql
  STABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;
  return websearch_to_tsquery('english', p_text);
exception
  -- The stack overflow arrives as internal_error. Anything else is not ours to swallow.
  when sqlstate 'XX000' then
    return null;
end;
$function$;

GRANT ALL ON FUNCTION public.text_search_query(text) TO authenticated;

GRANT ALL ON FUNCTION public.text_search_query(text) TO service_role;
-- Hand-written. pg-delta does not emit revokes, so the new function would stay executable by
-- PUBLIC and anon. search() is security invoker and calls it, so authenticated needs it.
REVOKE ALL ON FUNCTION public.text_search_query(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.text_search_query(text) TO authenticated, service_role;
