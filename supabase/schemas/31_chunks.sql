-- space_id and org_id are denormalized onto chunks on purpose. RLS then
-- evaluates against a single indexed column with no join, so a permission check
-- does not turn every similarity search into a nested loop.
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  ordinal integer not null,
  content text not null,
  embedding extensions.vector(1536),
  tsv tsvector generated always as (to_tsvector('english', content)) stored,
  token_count integer,
  created_at timestamptz not null default now(),
  unique (document_id, ordinal)
);

create index chunks_embedding_idx
  on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index chunks_tsv_idx on public.chunks using gin (tsv);
alter table public.chunks add constraint chunks_id_space_key unique (id, space_id);

create index chunks_space_id_idx on public.chunks (space_id);
create index chunks_document_id_idx on public.chunks (document_id);

alter table public.chunks enable row level security;
alter table public.chunks force row level security;
