-- More than one connection per provider.
--
-- A work Notion and a personal Notion are two accounts, not one, and the same
-- is true of two Google accounts or two Vercel teams. The old shape allowed
-- exactly one row per user per provider, so the second was an update over the
-- first and the first silently disappeared.
--
-- What replaces it: many rows per provider, each with a label the wearer
-- chose. Labels are unique per provider per user, so a list never shows two
-- rows a person cannot tell apart.

-- That unique key was also the replica identity, chosen so a delete carries
-- user_id and Realtime can work out who to tell. Its replacement has to do the
-- same job: unique, not null, and carrying user_id. (user_id, id) is all
-- three, and unlike the old one it survives a second account per provider.
create unique index connections_user_id_id_key
  on public.connections (user_id, id);

alter table public.connections
  replica identity using index connections_user_id_id_key;

alter table public.connections
  drop constraint connections_user_id_provider_key;

alter table public.connections
  add column label text;

comment on column public.connections.label is
  'What the wearer calls this account, such as Work or Personal. Null until
   they name it; the connections list falls back to the external account.';

-- Two rows for one provider are fine. Two rows a person cannot tell apart are
-- not, so a label is unique within a provider. Null is exempt, which is what
-- lets a fresh connection exist before it has been named.
create unique index connections_user_provider_label_key
  on public.connections (user_id, provider, label)
  where label is not null;

-- A connection is the thing a page reads from, so it is the thing a cache
-- entry belongs to. Without this, a second Notion overwrites the first's
-- counts every poll and the badge shows one account's numbers under both.
alter table public.provider_cache
  add column connection_id uuid references public.connections on delete cascade;

comment on column public.provider_cache.connection_id is
  'Which connection this entry was read through. Null for a page that reads
   nothing per-account, such as the previous-counter comparison point.';

-- provider_cache was keyed by (user_id, provider, cache_key) as its primary
-- key, and a primary key cannot hold a null. A surrogate key replaces it so
-- connection_id can be absent for entries that belong to no single account.
alter table public.provider_cache
  drop constraint provider_cache_pkey;

alter table public.provider_cache
  add column id uuid primary key default gen_random_uuid();

create unique index provider_cache_scope_key
  on public.provider_cache (user_id, provider, cache_key, connection_id)
  nulls not distinct;

-- Renaming is the only thing a client may change here. The token columns stay
-- unreachable: a column-level grant, not a policy, because a policy governs
-- rows and this governs which columns of a row a client may write at all.
--
-- Select as well as update: connections_public is security_invoker, so reading
-- the label through the view needs the privilege on the column itself.
grant select (label), update (label) on public.connections to authenticated;

-- The label has to reach the client, which reads this view rather than the
-- table. Recreated rather than altered: a view's column list is fixed at
-- creation.
drop view public.connections_public;

create view public.connections_public
  with (security_invoker = true) as
  select id, user_id, provider, label, external_account, scopes, expires_at,
         status, error_message, meta, created_at, updated_at
  from public.connections;

grant select on public.connections_public to authenticated;
