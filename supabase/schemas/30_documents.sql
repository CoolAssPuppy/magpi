create type public.document_origin as enum ('upload', 'sync', 'dream');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null,
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
  size_bytes bigint,
  -- Every dream document cites the chunks it came from. There is no uncited
  -- synthesis, so a dream output with an empty array is a run that produced
  -- nothing rather than a claim with no source.
  --
  -- not null with a default, matching messages.citations, because empty and null
  -- are different answers. Empty says the run looked and found nothing worth
  -- citing. Null says nobody recorded anything, which is the state this column
  -- exists to make impossible, and it is what a job gets by not setting the
  -- field, which is the easy path.
  source_chunk_ids uuid[] not null default '{}'
);

-- Incremental sync looks a document up by its source identity on every pass.
create unique index documents_connection_external_idx
  on public.documents (connection_id, external_id)
  where connection_id is not null and external_id is not null;

-- The target of the composite foreign keys that keep a dream run inside its own
-- space. Postgres needs a unique constraint on exactly these two columns before
-- another table can reference them together.
alter table public.documents add constraint documents_id_space_key unique (id, space_id);

-- org_id carried through the space, the same way space_id is carried through
-- the document. Without it a row can name a space in one organization and an
-- org_id in another, and the meters believe the org_id.
--
-- It replaces the single-column reference rather than joining it. Two foreign
-- keys between the same pair of tables give PostgREST two relationships to
-- choose from and every embed fails as ambiguous, which is how the spaces page
-- found out. The composite is the stronger of the two: it says the space exists
-- and that it belongs to the org named on this row.
alter table public.documents
  add constraint documents_space_in_org
  foreign key (space_id, org_id) references public.spaces (id, org_id)
  on delete cascade;

create index documents_space_id_idx on public.documents (space_id);
create index documents_org_id_idx on public.documents (org_id);
create index documents_origin_idx on public.documents (space_id, origin);
create index documents_dead_content_idx on public.documents (org_id, last_retrieved_at);

alter table public.documents enable row level security;
alter table public.documents force row level security;
