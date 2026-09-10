-- Empty means the run found nothing worth citing; null means nobody recorded anything.

update public.documents set source_chunk_ids = '{}' where source_chunk_ids is null;

alter table public.documents
  alter column source_chunk_ids set default '{}',
  alter column source_chunk_ids set not null;
