create type public.entity_kind as enum ('person', 'project', 'customer', 'decision');

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind public.entity_kind not null,
  name text not null,
  canonical_name text not null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, kind, canonical_name)
);

alter table public.entities add constraint entities_id_space_key unique (id, space_id);

create index entities_space_id_idx on public.entities (space_id);

create table public.entity_mentions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  document_id uuid not null,
  chunk_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (entity_id, chunk_id)
);

-- space_id is denormalized here, so without these it can name a chunk from
-- anywhere. Same reason as dream_links.
alter table public.entity_mentions
  add constraint entity_mentions_entity_in_space
    foreign key (entity_id, space_id) references public.entities (id, space_id)
    on delete cascade,
  add constraint entity_mentions_document_in_space
    foreign key (document_id, space_id) references public.documents (id, space_id)
    on delete cascade,
  add constraint entity_mentions_chunk_in_space
    foreign key (chunk_id, space_id) references public.chunks (id, space_id)
    on delete cascade;

create index entity_mentions_document_idx on public.entity_mentions (document_id);
create index entity_mentions_space_id_idx on public.entity_mentions (space_id);

alter table public.entities enable row level security;
alter table public.entities force row level security;
alter table public.entity_mentions enable row level security;
alter table public.entity_mentions force row level security;
