-- Publication membership is not captured by `supabase db diff`. Both ingest
-- progress and streaming chat depend on Realtime, so it is a migration.

alter publication supabase_realtime add table public.ingest_jobs;
alter publication supabase_realtime add table public.documents;
alter publication supabase_realtime add table public.dream_runs;
alter publication supabase_realtime add table public.connections;
alter publication supabase_realtime add table public.messages;

-- Realtime resolves RLS against the old row on update and delete, and without a
-- full replica identity the old row is only its primary key. Every table above is
-- filtered by space_id or conversation_id in its policy, so those columns have to
-- be in the WAL image.
alter table public.ingest_jobs replica identity full;
alter table public.documents replica identity full;
alter table public.dream_runs replica identity full;
alter table public.connections replica identity full;
alter table public.messages replica identity full;
