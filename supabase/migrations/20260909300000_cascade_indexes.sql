-- Index the six foreign keys a frequent delete cascades through.

create index entity_mentions_chunk_idx on public.entity_mentions (chunk_id);
create index dream_links_document_a_idx on public.dream_links (document_a);
create index dream_links_document_b_idx on public.dream_links (document_b);
create index dream_runs_output_idx on public.dream_runs (output_document_id);
create index documents_dream_run_idx on public.documents (dream_run_id);
create index ingest_jobs_connection_idx on public.ingest_jobs (connection_id);
