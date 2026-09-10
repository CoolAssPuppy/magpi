-- Carry space_id through the rest. A composite `on delete set null` needs a column list.

alter table public.dream_runs drop constraint dream_runs_output_in_space;

alter table public.dream_runs
  add constraint dream_runs_output_in_space
  foreign key (output_document_id, space_id)
  references public.documents (id, space_id)
  on delete set null (output_document_id);

-- RLS on chunks is what public.search filters, so a cross-space chunk exposes its document.
alter table public.chunks drop constraint chunks_document_id_fkey;

alter table public.chunks
  add constraint chunks_document_in_space
  foreign key (document_id, space_id) references public.documents (id, space_id)
  on delete cascade;

-- The three remaining plain foreign keys that permitted a cross-space reference.
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
