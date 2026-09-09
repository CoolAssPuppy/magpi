create type public.connection_status as enum ('active', 'syncing', 'error', 'revoked', 'expired');

-- Many connections per provider per space. No unique (user_id, provider): a team
-- member connects two Notion workspaces on day one, and retrofitting that later
-- is painful.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  space_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null references public.providers (slug),
  external_account_id text,
  access_token_enc bytea,
  refresh_token_enc bytea,
  scopes text[] not null default '{}',
  -- Which channels, folders or workspaces this connection reads. Shape is the
  -- driver's business; the column only guarantees it is an object.
  scope_selection jsonb not null default '{}',
  status public.connection_status not null default 'active',
  status_detail text,
  cursor text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- org_id carried through the space. Without it a row can name a space in one
-- organization and an org_id in another, and the meters believe the org_id.
--
-- It replaces the single-column reference rather than joining it. Two foreign
-- keys between the same pair of tables give PostgREST two relationships to
-- choose from and every embed fails as ambiguous, which is how the spaces page
-- found out. The composite is the stronger of the two: it says the space exists
-- and that it belongs to the org named on this row.
alter table public.connections
  add constraint connections_space_in_org
  foreign key (space_id, org_id) references public.spaces (id, org_id)
  on delete cascade;

create index connections_space_id_idx on public.connections (space_id);
create index connections_org_id_idx on public.connections (org_id);
create index connections_user_id_idx on public.connections (user_id);

alter table public.connections
  add constraint connections_scope_selection_is_object
  check (jsonb_typeof(scope_selection) = 'object');

alter table public.connections enable row level security;
alter table public.connections force row level security;
