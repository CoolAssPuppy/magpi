-- space_id and org_id are denormalized onto chunks on purpose. RLS then
-- evaluates against a single indexed column with no join, so a permission check
-- does not turn every similarity search into a nested loop.
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
  -- Also the only index chunks needs on document_id: a btree on (a, b) serves
  -- a lookup on a, and chunks is the hottest write path in the product.
  unique (document_id, ordinal)
);

create index chunks_embedding_idx
  on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index chunks_tsv_idx on public.chunks using gin (tsv);
alter table public.chunks add constraint chunks_id_space_key unique (id, space_id);

-- The one that matters most. Chunks carry the text and RLS on chunks is what
-- public.search filters, so a chunk filed against a document in another space
-- makes that document searchable and readable in full. Every writer of chunks
-- reaches this, the ingest pipeline included: a batch loop reusing one space_id
-- across documents produces it directly.
alter table public.chunks
  add constraint chunks_document_in_space
  foreign key (document_id, space_id) references public.documents (id, space_id)
  on delete cascade;

-- org_id carried through the space. Without it a row can name a space in one
-- organization and an org_id in another, and the meters believe the org_id.
--
-- It replaces the single-column reference rather than joining it. Two foreign
-- keys between the same pair of tables give PostgREST two relationships to
-- choose from and every embed fails as ambiguous, which is how the spaces page
-- found out. The composite is the stronger of the two: it says the space exists
-- and that it belongs to the org named on this row.
alter table public.chunks
  add constraint chunks_space_in_org
  foreign key (space_id, org_id) references public.spaces (id, org_id)
  on delete cascade;

create index chunks_space_id_idx on public.chunks (space_id);

alter table public.chunks enable row level security;
alter table public.chunks force row level security;
