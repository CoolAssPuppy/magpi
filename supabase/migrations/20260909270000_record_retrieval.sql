-- Write the two columns the dead-content panel reads.

-- Security definer, scoped to the caller's visible spaces. Counts once per search, not per chunk.
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
