-- space_id and org_id are denormalized onto chunks so RLS filters one indexed column.
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null,
  document_id uuid not null,
  ordinal integer not null,
  content text not null,
  embedding extensions.vector(1536),
  tsv tsvector generated always as (to_tsvector('english', content)) stored,
  token_count integer,
  created_at timestamptz not null default now(),
  -- Also the only index chunks needs on document_id, since a btree on (a, b) serves a.
  unique (document_id, ordinal)
);

create index chunks_embedding_idx
  on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index chunks_tsv_idx on public.chunks using gin (tsv);
alter table public.chunks add constraint chunks_id_space_key unique (id, space_id);

-- Keeps a chunk in its document's space, which is what public.search filters on.
alter table public.chunks
  add constraint chunks_document_in_space
  foreign key (document_id, space_id) references public.documents (id, space_id)
  on delete cascade;

-- Carries org_id through the space. It replaces the single-column reference to spaces.
alter table public.chunks
  add constraint chunks_space_in_org
  foreign key (space_id, org_id) references public.spaces (id, org_id)
  on delete cascade;

create index chunks_space_id_idx on public.chunks (space_id);

alter table public.chunks enable row level security;
alter table public.chunks force row level security;
