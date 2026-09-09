-- Index the foreign keys a frequent delete cascades through.
--
-- Postgres indexes the referenced side of a foreign key and never the
-- referencing side, so a delete on the parent scans the child unless someone
-- says otherwise. Twenty-two foreign keys in this schema lead on an unindexed
-- column; these six are the ones a routine operation reaches.
--
-- The worst is entity_mentions. Re-ingesting a document deletes its chunks, and
-- every chunk delete cascades through entity_mentions_chunk_in_space, so the
-- most frequent write in the product was a sequential scan per chunk.
--
-- The other sixteen are left alone on purpose. They lead on org_id, user_id or
-- a provider slug, reached only by deleting an organization, an account or a
-- provider, and an index that is read once a year still costs every insert.

create index entity_mentions_chunk_idx on public.entity_mentions (chunk_id);
create index dream_links_document_a_idx on public.dream_links (document_a);
create index dream_links_document_b_idx on public.dream_links (document_b);
create index dream_runs_output_idx on public.dream_runs (output_document_id);
create index documents_dream_run_idx on public.documents (dream_run_id);
create index ingest_jobs_connection_idx on public.ingest_jobs (connection_id);
