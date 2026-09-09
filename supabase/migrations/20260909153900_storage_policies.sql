-- Storage policies. `supabase db diff` does not track the storage schema, so
-- these are hand-written and stay hand-written.
--
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
