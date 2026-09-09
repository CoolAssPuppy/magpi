create type public.ingest_stage as enum ('fetch', 'extract', 'chunk', 'embed', 'store');

create type public.ingest_status as enum ('queued', 'running', 'succeeded', 'failed', 'timeout');

create table public.ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  connection_id uuid references public.connections (id) on delete cascade,
  stage public.ingest_stage not null default 'fetch',
  attempts integer not null default 0,
  status public.ingest_status not null default 'queued',
  error text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ingest_jobs_claim_idx on public.ingest_jobs (status, created_at) where status = 'queued';
create index ingest_jobs_space_idx on public.ingest_jobs (space_id, updated_at desc);
create index ingest_jobs_document_idx on public.ingest_jobs (document_id);

alter table public.ingest_jobs enable row level security;
alter table public.ingest_jobs force row level security;
