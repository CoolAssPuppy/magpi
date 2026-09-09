-- One connection per account per provider per space.
--
-- connections-claim matched the existing connection with
-- `.eq('external_account_id', null)`, which never matches in PostgREST, so a
-- provider that returns no account label filed a fresh row carrying a live
-- token on every reconnect. The code path is fixed; this is the database
-- saying the same thing, so the next caller cannot reintroduce it.
--
-- Two partial indexes rather than one over the nullable column, because a
-- unique index treats every null as distinct and would not have constrained the
-- case that actually broke.

create unique index connections_account_idx
  on public.connections (space_id, user_id, provider, external_account_id)
  where external_account_id is not null;

create unique index connections_no_account_idx
  on public.connections (space_id, user_id, provider)
  where external_account_id is null;
