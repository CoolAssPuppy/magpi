create type public.connection_status as enum ('active', 'syncing', 'error', 'revoked', 'expired');

-- One row per authorized account. Which spaces it feeds is `scope_selection.routes`, so the same
-- account can send one channel to Engineering and another to Finance.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null references public.providers (slug),
  external_account_id text,
  access_token_enc bytea,
  refresh_token_enc bytea,
  scopes text[] not null default '{}',
  -- What the account can read and where each unit lands. Shape is the driver's.
  scope_selection jsonb not null default '{}',
  status public.connection_status not null default 'active',
  status_detail text,
  cursor text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One connection per account per org. Two partial indexes, since unique treats nulls as distinct.
create unique index connections_account_idx
  on public.connections (org_id, user_id, provider, external_account_id)
  where external_account_id is not null;

create unique index connections_no_account_idx
  on public.connections (org_id, user_id, provider)
  where external_account_id is null;

create index connections_org_id_idx on public.connections (org_id);
create index connections_user_id_idx on public.connections (user_id);

alter table public.connections
  add constraint connections_scope_selection_is_object
  check (jsonb_typeof(scope_selection) = 'object');

-- Every value in `routes` is a space id, so a policy can test them without parsing the whole blob.
create index connections_routes_idx on public.connections
  using gin ((scope_selection -> 'routes'));

alter table public.connections enable row level security;
alter table public.connections force row level security;
