-- Storage policies and realtime publication membership.
--
-- `supabase db diff` captures neither, so both also exist as hand-written
-- migrations. They are declared here as well so the shadow database the diff
-- builds matches the applied one. Without that, every future diff proposes
-- dropping them, which is how a routine schema change turned destructive once
-- already. See docs/lessons.md.

drop policy if exists documents_bucket_select on storage.objects;
drop policy if exists documents_bucket_insert on storage.objects;
drop policy if exists documents_bucket_delete on storage.objects;

-- Objects are keyed `${space_id}/${document_id}/${filename}`, so the first path
-- segment is the permission decision, checked against the same visibility set as
-- every other table.
create policy documents_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (select public.visible_space_ids())
  );

create policy documents_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (select public.visible_space_ids())
  );

create policy documents_bucket_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1]::uuid in (select public.visible_space_ids())
  );

-- Both ingest progress and streaming chat depend on Realtime.
alter publication supabase_realtime add table public.ingest_jobs;
alter publication supabase_realtime add table public.documents;
alter publication supabase_realtime add table public.dream_runs;
alter publication supabase_realtime add table public.connections;
alter publication supabase_realtime add table public.messages;

-- Realtime resolves RLS against the old row on update and delete, and without a
-- full replica identity the old row is only its primary key. Every table above
-- is filtered by space_id or conversation_id in its policy, so those columns
-- have to be in the WAL image.
alter table public.ingest_jobs replica identity full;
alter table public.documents replica identity full;
alter table public.dream_runs replica identity full;
alter table public.connections replica identity full;
alter table public.messages replica identity full;
