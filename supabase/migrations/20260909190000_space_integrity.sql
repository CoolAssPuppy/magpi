-- Finish carrying space_id through every reference, and fix a regression the
-- previous migration introduced.
--
-- pgTAP caught both. The regression is the more embarrassing one: a bare
-- `on delete set null` on a composite foreign key nulls every referencing
-- column, so deleting a dream output tried to null dream_runs.space_id, which is
-- not null, and the delete failed outright. A user must be able to delete a
-- dream output. Postgres 15 added the column list that says which column to
-- null, and this database is on 17.

alter table public.dream_runs drop constraint dream_runs_output_in_space;

alter table public.dream_runs
  add constraint dream_runs_output_in_space
  foreign key (output_document_id, space_id)
  references public.documents (id, space_id)
  on delete set null (output_document_id);

-- Chunks were the worst remaining gap. They carry the text, and RLS on chunks is
-- what public.search filters, so a chunk filed against a document in another
-- space makes that document searchable and readable in full. This is not only a
-- dreaming problem: every writer of chunks reaches it, and a batch loop reusing
-- one space_id across documents produces it directly.
alter table public.chunks drop constraint chunks_document_id_fkey;

alter table public.chunks
  add constraint chunks_document_in_space
  foreign key (document_id, space_id) references public.documents (id, space_id)
  on delete cascade;

-- The three remaining plain foreign keys that permitted a cross-space reference.
-- RLS blocks the read in all three today, so these are consistency rather than
-- exposure, and consistency is what stops the next policy change becoming one.
alter table public.dream_runs add constraint dream_runs_id_space_key unique (id, space_id);
alter table public.entities add constraint entities_id_space_key unique (id, space_id);

alter table public.documents
  add constraint documents_dream_run_in_space
  foreign key (dream_run_id, space_id) references public.dream_runs (id, space_id)
  on delete set null (dream_run_id);

alter table public.dream_links drop constraint dream_links_dream_run_id_fkey;

alter table public.dream_links
  add constraint dream_links_run_in_space
  foreign key (dream_run_id, space_id) references public.dream_runs (id, space_id)
  on delete cascade;

alter table public.entity_mentions drop constraint entity_mentions_entity_id_fkey;

alter table public.entity_mentions
  add constraint entity_mentions_entity_in_space
  foreign key (entity_id, space_id) references public.entities (id, space_id)
  on delete cascade;
