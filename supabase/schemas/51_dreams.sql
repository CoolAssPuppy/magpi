create type public.dream_kind as enum ('entities', 'digest', 'connections');

create type public.dream_status as enum ('queued', 'running', 'succeeded', 'failed', 'timeout');

-- A dream run is scoped to exactly one space. It reads only that space and
-- writes only into that space. That is the security model, not a simplification:
-- a synthesis job reading across spaces under the service role and surfacing the
-- result is a permission bypass wearing a friendly name.
create table public.dream_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind public.dream_kind not null,
  status public.dream_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  input_document_count integer not null default 0,
  output_document_id uuid references public.documents (id) on delete set null,
  error text,
  triggered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index dream_runs_space_created_idx on public.dream_runs (space_id, created_at desc);

-- A candidate link between two documents in the same space, from different
-- sources, that look like they are about the same thing. Surfaced for a human.
create table public.dream_links (
  id uuid primary key default gen_random_uuid(),
  dream_run_id uuid not null references public.dream_runs (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  document_a uuid not null references public.documents (id) on delete cascade,
  document_b uuid not null references public.documents (id) on delete cascade,
  similarity real not null,
  rationale text,
  confirmed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  check (document_a < document_b),
  unique (space_id, document_a, document_b)
);

create index dream_links_space_idx on public.dream_links (space_id, created_at desc);

alter table public.dream_runs enable row level security;
alter table public.dream_runs force row level security;
alter table public.dream_links enable row level security;
alter table public.dream_links force row level security;
