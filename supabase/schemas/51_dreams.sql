create type public.dream_kind as enum ('entities', 'digest', 'connections');

create type public.dream_status as enum ('queued', 'running', 'succeeded', 'failed', 'timeout');

-- A dream run is scoped to exactly one space: it reads and writes only that space.
create table public.dream_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind public.dream_kind not null,
  status public.dream_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  input_document_count integer not null default 0,
  output_document_id uuid,
  error text,
  triggered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Carries space_id through the key, and nulls only output_document_id on delete.
alter table public.dream_runs
  add constraint dream_runs_output_in_space
  foreign key (output_document_id, space_id)
  references public.documents (id, space_id)
  on delete set null (output_document_id);

-- The target for anything that has to stay inside a run's own space.
alter table public.dream_runs add constraint dream_runs_id_space_key unique (id, space_id);

-- A document tagged with a run from another space would credit work it never read.
alter table public.documents
  add constraint documents_dream_run_in_space
  foreign key (dream_run_id, space_id) references public.dream_runs (id, space_id)
  on delete set null (dream_run_id);

create index dream_runs_space_created_idx on public.dream_runs (space_id, created_at desc);
-- The dream output a reader can delete from the UI, which nulls this column.
create index dream_runs_output_idx on public.dream_runs (output_document_id);

-- A candidate link between two documents in one space that look like the same thing.
create table public.dream_links (
  id uuid primary key default gen_random_uuid(),
  dream_run_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  document_a uuid not null,
  document_b uuid not null,
  similarity real not null,
  rationale text,
  confirmed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  check (document_a < document_b),
  unique (space_id, document_a, document_b)
);

-- rationale is model-written prose, so a link across spaces would leak a summary.
alter table public.dream_links
  add constraint dream_links_run_in_space
    foreign key (dream_run_id, space_id) references public.dream_runs (id, space_id)
    on delete cascade,
  add constraint dream_links_document_a_in_space
    foreign key (document_a, space_id) references public.documents (id, space_id)
    on delete cascade,
  add constraint dream_links_document_b_in_space
    foreign key (document_b, space_id) references public.documents (id, space_id)
    on delete cascade;

create index dream_links_space_idx on public.dream_links (space_id, created_at desc);
-- Deleting a document cascades to both ends of every link, which the space index cannot serve.
create index dream_links_document_a_idx on public.dream_links (document_a);
create index dream_links_document_b_idx on public.dream_links (document_b);

alter table public.dream_runs enable row level security;
alter table public.dream_runs force row level security;
alter table public.dream_links enable row level security;
alter table public.dream_links force row level security;
