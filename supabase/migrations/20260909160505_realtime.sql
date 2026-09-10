-- Publication membership is not captured by `supabase db diff`, so it lives in a migration.

alter publication supabase_realtime add table public.ingest_jobs;
alter publication supabase_realtime add table public.documents;
alter publication supabase_realtime add table public.dream_runs;
alter publication supabase_realtime add table public.connections;
alter publication supabase_realtime add table public.messages;

-- Realtime resolves RLS against the old row, so the policy columns must be in the WAL image.
alter table public.ingest_jobs replica identity full;
alter table public.documents replica identity full;
alter table public.dream_runs replica identity full;
alter table public.connections replica identity full;
alter table public.messages replica identity full;
