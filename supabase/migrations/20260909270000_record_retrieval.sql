-- Write the two columns the dead-content panel reads.

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
