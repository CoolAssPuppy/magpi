create type public.ingest_stage as enum ('fetch', 'extract', 'chunk', 'embed', 'store');

create type public.ingest_status as enum ('queued', 'running', 'succeeded', 'failed', 'timeout');

create table public.ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null,
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

-- A job cannot reach a terminal state with nothing to show the user. Without
-- this a failed import leaves the page no honest option but a spinner.
alter table public.ingest_jobs
  add constraint ingest_jobs_terminal_has_error
  check (status not in ('failed', 'timeout') or error is not null);

create index ingest_jobs_claim_idx on public.ingest_jobs (status, created_at) where status = 'queued';
-- org_id carried through the space. Without it a row can name a space in one
-- organization and an org_id in another, and the meters believe the org_id.
--
-- It replaces the single-column reference rather than joining it. Two foreign
-- keys between the same pair of tables give PostgREST two relationships to
-- choose from and every embed fails as ambiguous, which is how the spaces page
-- found out. The composite is the stronger of the two: it says the space exists
-- and that it belongs to the org named on this row.
alter table public.ingest_jobs
  add constraint ingest_jobs_space_in_org
  foreign key (space_id, org_id) references public.spaces (id, org_id)
  on delete cascade;

create index ingest_jobs_space_idx on public.ingest_jobs (space_id, updated_at desc);
create index ingest_jobs_document_idx on public.ingest_jobs (document_id);

alter table public.ingest_jobs enable row level security;
alter table public.ingest_jobs force row level security;
