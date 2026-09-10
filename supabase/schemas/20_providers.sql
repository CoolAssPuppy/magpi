-- The provider registry. The connections page renders from this table.
create table public.providers (
  slug text primary key,
  display_name text not null,
  description text not null default '',
  kind text not null default 'oauth' check (kind in ('oauth', 'api_key')),
  auth_url text,
  token_url text,
  scopes text[] not null default '{}',
  docs_url text,
  enabled boolean not null default false,
  position integer not null default 0,
  -- 'channel' for Slack, 'folder' for Drive, null where the whole account is the scope.
  scope_selection_kind text check (scope_selection_kind in ('channel', 'folder', 'workspace'))
);

-- An oauth provider is unusable without its endpoints, and an api_key provider has none.
alter table public.providers
  add constraint providers_oauth_urls_present
  check (kind <> 'oauth' or (auth_url is not null and token_url is not null));

alter table public.providers enable row level security;
alter table public.providers force row level security;

-- Pending OAuth attempts. The PKCE verifier stays server side. Rows are single use and expire.
create table public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null references public.providers (slug),
  code_verifier text not null,
  -- Which space the resulting connection lands in, chosen before the redirect.
  space_id uuid not null references public.spaces (id) on delete cascade,
  return_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index oauth_states_expires_idx on public.oauth_states (expires_at);

alter table public.oauth_states enable row level security;
alter table public.oauth_states force row level security;

-- No policies and no client grants. A user must never be able to read their own verifier.
grant select, insert, update, delete on public.oauth_states to service_role;

-- Holds a new provider token until the browser proves it belongs to the account that started.
create table public.pending_connections (
  ticket_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null references public.providers (slug),
  space_id uuid not null references public.spaces (id) on delete cascade,
  external_account_id text,
  access_token_enc bytea not null,
  refresh_token_enc bytea,
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  return_to text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index pending_connections_expires_at_idx on public.pending_connections (expires_at);

alter table public.pending_connections enable row level security;
alter table public.pending_connections force row level security;

grant select, insert, update, delete on public.pending_connections to service_role;

-- Fixed-window rate counters in Postgres, because a per-instance counter multiplies the limit.
create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;

grant select, insert, update, delete on public.rate_limits to service_role;
