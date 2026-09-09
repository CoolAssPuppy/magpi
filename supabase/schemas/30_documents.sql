create type public.document_origin as enum ('upload', 'sync', 'dream');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  connection_id uuid references public.connections (id) on delete set null,
  external_id text,
  title text not null default 'Untitled',
  url text,
  mime_type text,
  storage_path text,
  content_hash text,
  origin public.document_origin not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Written by the dream job so a digest can be traced back to its run.
  dream_run_id uuid,
  last_retrieved_at timestamptz,
  retrieval_count bigint not null default 0,
  size_bytes bigint
);

-- Incremental sync looks a document up by its source identity on every pass.
create unique index documents_connection_external_idx
  on public.documents (connection_id, external_id)
  where connection_id is not null and external_id is not null;

-- The target of the composite foreign keys that keep a dream run inside its own
-- space. Postgres needs a unique constraint on exactly these two columns before
-- another table can reference them together.
alter table public.documents add constraint documents_id_space_key unique (id, space_id);

create index documents_space_id_idx on public.documents (space_id);
create index documents_org_id_idx on public.documents (org_id);
create index documents_origin_idx on public.documents (space_id, origin);
create index documents_dead_content_idx on public.documents (org_id, last_retrieved_at);

alter table public.documents enable row level security;
alter table public.documents force row level security;
