-- documents.source_chunk_ids landed nullable, which undoes the rule it was added
-- for.
--
-- Empty and null are different answers. Empty says the dream run looked and
-- found nothing worth citing. Null says nobody recorded anything, which is the
-- uncited synthesis the column exists to make impossible, and it is what a job
-- gets by simply not setting the field.
--
-- messages.citations already draws this line in the same schema, as
-- `jsonb not null default '[]'`. This is the same shape for the same reason.

update public.documents set source_chunk_ids = '{}' where source_chunk_ids is null;

alter table public.documents
  alter column source_chunk_ids set default '{}',
  alter column source_chunk_ids set not null;
