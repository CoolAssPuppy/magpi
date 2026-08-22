-- Initial schema.
--
-- The server is the security boundary, not the badge. Every table has row
-- level security on and forced. Client policies exist only where a user
-- manages their own data; everything privileged goes through edge functions
-- under the service role. A table with no policies denies all client access,
-- which is deliberate.

create extension if not exists pgcrypto with schema extensions;

-- One row per auth user, created by a trigger on signup.
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  handle       text unique,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Display data for a user. Never holds credentials.';

-- Pairing state for the device authorization grant (RFC 8628).
create table public.device_codes (
  id                uuid primary key default gen_random_uuid(),
  user_code         text not null unique,
  -- Only ever the sha256 of the device code. The raw value exists on the
  -- badge and in one response body, never at rest here.
  device_code_hash  bytea not null,
  status            text not null default 'pending'
                      check (status in ('pending','approved','claimed','expired','denied')),
  user_id           uuid references auth.users on delete cascade,
  badge_id          uuid,
  badge_uid         text,
  poll_interval_s   int not null default 5,
  poll_count        int not null default 0,
  failed_lookups    int not null default 0,
  last_poll_at      timestamptz,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);

create index device_codes_user_code_idx on public.device_codes (user_code);
create index device_codes_status_expires_idx on public.device_codes (status, expires_at);
-- Poll looks the row up by hash on every request.
create index device_codes_hash_idx on public.device_codes (device_code_hash);

comment on column public.device_codes.failed_lookups is
  'Drives the user_code lockout. Counted server-side because a per-instance
   counter cannot survive across serverless invocations.';

-- The durable link between a device and a user.
create table public.badges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  badge_uid     text not null,
  label         text,
  token_hash    bytea not null,
  token_version int not null default 1,
  fw            text,
  sdk           text,
  last_seen_at  timestamptz,
  battery_v     numeric(4, 2),
  charging      boolean,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

-- One active badge per hardware uid. A revoked row keeps its history and
-- stops blocking a re-pair.
create unique index badges_uid_active on public.badges (badge_uid) where revoked_at is null;
create index badges_user_id_idx on public.badges (user_id);
-- Every gateway call resolves a bearer token to a badge through this index.
create unique index badges_token_hash_idx on public.badges (token_hash);

-- The provider registry. The connections page renders from this, so adding a
-- provider is a migration and a page builder, never a React change.
create table public.providers (
  slug         text primary key,
  display_name text not null,
  description  text not null default '',
  kind         text not null default 'oauth' check (kind in ('oauth', 'api_key')),
  auth_url     text,
  token_url    text,
  scopes       text[] not null default '{}',
  docs_url     text,
  enabled      boolean not null default false,
  position     int not null default 0
);

-- An oauth provider is unusable without its endpoints, and an api_key
-- provider has none. Enforced here so a half-filled row cannot be seeded.
alter table public.providers add constraint providers_oauth_urls_present
  check (kind <> 'oauth' or (auth_url is not null and token_url is not null));

comment on table public.providers is
  'Drives the connections UI. Readable by any signed-in user, written only by
   the service role.';

-- A user's linked third-party accounts. Both credential kinds store their
-- secret in access_token_enc through the same encryption path.
create table public.connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  provider          text not null references public.providers(slug),
  external_account  text,
  access_token_enc  bytea,
  refresh_token_enc bytea,
  scopes            text[] not null default '{}',
  expires_at        timestamptz,
  status            text not null default 'active'
                      check (status in ('active','revoked','error')),
  error_message     text,
  -- Host, project id, insight id, and anything else a provider needs that is
  -- not a secret.
  meta              jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, provider)
);

create index connections_user_id_idx on public.connections (user_id);

-- Which Notifier pages are on, in what order, and how each is configured.
-- The device reads the order from the payload, never from its own storage.
create table public.page_configs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  page_slug  text not null,
  enabled    boolean not null default false,
  position   int not null default 0,
  settings   jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (user_id, page_slug)
);

create index page_configs_user_id_idx on public.page_configs (user_id);

-- One row per user. Notifier carries these to the badge in the payload it is
-- already fetching, and writes them to /state/pomodoro.json.
create table public.pomodoro_settings (
  user_id    uuid primary key references auth.users on delete cascade,
  work_min   int not null default 25 check (work_min between 1 and 120),
  short_min  int not null default 5 check (short_min between 1 and 60),
  long_min   int not null default 20 check (long_min between 1 and 120),
  sessions   int not null default 4 check (sessions between 2 and 8),
  leds       boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Upstream responses, held long enough that a badge polling every thirty
-- seconds does not become an upstream call every thirty seconds.
create table public.provider_cache (
  user_id    uuid not null references auth.users on delete cascade,
  provider   text not null references public.providers(slug),
  cache_key  text not null,
  payload    jsonb not null,
  expires_at timestamptz not null,
  primary key (user_id, provider, cache_key)
);

create index provider_cache_expires_idx on public.provider_cache (expires_at);

comment on table public.provider_cache is
  'Service role only. Never readable by a client: a cached calendar is the
   same data the page shows, but reachable without the page.';
