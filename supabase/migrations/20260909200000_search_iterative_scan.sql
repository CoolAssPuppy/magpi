-- Restore recall under an RLS filter, and give a dream document somewhere to record its citations.

-- Required: until a vector operation has run in the session, the ALTER below is refused.
do $$
begin
  perform '[1]'::extensions.vector;
end;
$$;

-- On the function, so every caller shares it. relaxed_order because search() re-ranks anyway.
alter function public.search(extensions.vector, text, uuid[], integer)
  set hnsw.iterative_scan = relaxed_order;

-- Where a dream document cites the chunks it came from.
alter table public.documents add column source_chunk_ids uuid[];
