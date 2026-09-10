-- Carry space_id through these foreign keys so the database refuses a cross-space reference.

alter table public.documents add constraint documents_id_space_key unique (id, space_id);
alter table public.chunks add constraint chunks_id_space_key unique (id, space_id);

-- The single-column keys are redundant once the composite ones exist.
alter table public.dream_links drop constraint dream_links_document_a_fkey;
alter table public.dream_links drop constraint dream_links_document_b_fkey;
alter table public.dream_runs drop constraint dream_runs_output_document_id_fkey;
alter table public.entity_mentions drop constraint entity_mentions_document_id_fkey;
alter table public.entity_mentions drop constraint entity_mentions_chunk_id_fkey;

alter table public.dream_links
  add constraint dream_links_document_a_in_space
    foreign key (document_a, space_id) references public.documents (id, space_id)
    on delete cascade,
  add constraint dream_links_document_b_in_space
    foreign key (document_b, space_id) references public.documents (id, space_id)
    on delete cascade;

-- MATCH SIMPLE, the default, because output_document_id is nullable.
alter table public.dream_runs
  add constraint dream_runs_output_in_space
  foreign key (output_document_id, space_id)
  references public.documents (id, space_id) on delete set null;

alter table public.entity_mentions
  add constraint entity_mentions_document_in_space
    foreign key (document_id, space_id) references public.documents (id, space_id)
    on delete cascade,
  add constraint entity_mentions_chunk_in_space
    foreign key (chunk_id, space_id) references public.chunks (id, space_id)
    on delete cascade;

-- A job cannot reach a terminal state with nothing to show the user.
alter table public.ingest_jobs
  add constraint ingest_jobs_terminal_has_error
  check (status not in ('failed', 'timeout') or error is not null);
