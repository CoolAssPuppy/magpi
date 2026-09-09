-- Keep a dream run inside its own space, at the database level.
--
-- The rule was written down in supabase/schemas/51_dreams.sql and enforced by
-- nothing. RLS cannot do it: the dream job runs as service_role, service_role
-- has BYPASSRLS, and no policy in the schema is evaluated for that process.
-- pgTAP proved a run in one space could file a link naming a document in
-- another, and dream_links.rationale is model-written prose describing both
-- documents, shown by dream_links_select_visible to every member of the space
-- the link is filed in. That is a written summary of a document the reader
-- cannot open.
--
-- Carrying space_id through the foreign key makes the database refuse the write.

alter table public.documents add constraint documents_id_space_key unique (id, space_id);
alter table public.chunks add constraint chunks_id_space_key unique (id, space_id);

-- The single-column keys are redundant once the composite ones exist, and
-- leaving both means two constraints to keep in step.
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

-- MATCH SIMPLE, the default, because output_document_id is nullable and a run
-- with no output yet must still be insertable.
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

-- A job cannot reach a terminal state with nothing to show the user. Without
-- this a failed import leaves the page no honest option but a spinner.
alter table public.ingest_jobs
  add constraint ingest_jobs_terminal_has_error
  check (status not in ('failed', 'timeout') or error is not null);
