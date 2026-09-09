-- Restore recall under an RLS filter, and give a dream document somewhere to
-- record its citations.
--
-- pgTAP measured the first one rather than assuming it. With a thousand chunks
-- in a space the caller cannot see, all ranking nearer the query than the five
-- that are theirs, an HNSW scan returns its ef_search nearest neighbours and RLS
-- then discards every one of them:
--
--   iterative off -> the caller gets 0 of their 5
--   iterative on  -> the caller gets 5 of their 5
--
-- Rows from the other space were never visible in any configuration, so this was
-- never a leak. It is a total recall failure on exactly the question vector
-- search exists to answer: the paraphrase, where the lexical arm cannot rescue
-- the result. Section 6 of the spec names it as the known risk.
--
-- At test-corpus size the planner picks a sequential scan and hides the whole
-- thing, which is why the assertion forces the index.
--
-- Read the two counts above as what was measured on the day this landed, not as
-- something the suite still checks. The behavioural half was withdrawn soon
-- after: a pgTAP file is one rolled-back transaction, so it asks an approximate
-- index about uncommitted rows, and it failed about one run in three in the
-- full gate while passing every time in isolation. What is still asserted is
-- that no row leaks and that the setting is on the function. The reasoning is
-- in supabase/tests/20_search.test.sql and docs/retrieval.md.

-- Required, not decorative. Until a vector operation has run in the session,
-- hnsw.iterative_scan is an unrecognised placeholder and the ALTER below is
-- refused with "permission denied to set parameter".
do $$
begin
  perform '[1]'::extensions.vector;
end;
$$;

-- On the function rather than the role or the database, so web, mobile and the
-- MCP server all get it from the one place they already share.
--
-- relaxed_order because search() re-ranks with reciprocal rank fusion
-- afterwards, so paying for scan order buys nothing.
alter function public.search(extensions.vector, text, uuid[], integer)
  set hnsw.iterative_scan = relaxed_order;

-- Every dream document cites the chunks it came from. Until now there was
-- nowhere to put them, so the dream job was appending a Sources section to the
-- prose, which is not something the UI can resolve through RLS on read.
alter table public.documents add column source_chunk_ids uuid[];
