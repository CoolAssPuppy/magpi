-- Pending OAuth authorization attempts.
--
-- The PKCE verifier and the state value live here rather than in a cookie
-- because the callback must be able to prove that this browser started this
-- exact attempt, and because a verifier that round-trips through the client
-- is a verifier the client can substitute. Rows are single use and short
-- lived: the callback consumes one and deletes it in the same statement.

create table public.oauth_states (
  -- The opaque value sent as the `state` query parameter. Random, not
  -- derived from anything, so it carries no information if observed.
  state          text primary key,
  user_id        uuid not null references auth.users on delete cascade,
  provider       text not null references public.providers(slug),
  -- PKCE verifier. Held server-side for the whole flow so the token
  -- exchange cannot be completed by anyone who only intercepted the code.
  code_verifier  text not null,
  -- Where to send the browser afterwards. Validated against an allowlist
  -- before it is stored, never taken from the callback request, so this
  -- cannot become an open redirect.
  return_to      text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null
);

create index oauth_states_expires_idx on public.oauth_states (expires_at);

alter table public.oauth_states enable row level security;
alter table public.oauth_states force row level security;

-- No policies and no client grants. A user must never be able to read their
-- own pending verifier: that is the one secret standing between an
-- intercepted authorization code and a usable provider token.
grant select, insert, update, delete on public.oauth_states to service_role;

comment on table public.oauth_states is
  'Single-use PKCE state. Consumed and deleted by the callback.';

/**
 * Atomically consumes a state row, returning it only if it exists and has
 * not expired.
 *
 * Delete-and-return in one statement so two concurrent callbacks with the
 * same state cannot both succeed. Checking then deleting would leave a
 * window where a replayed callback completes a second token exchange.
 */
create or replace function public.consume_oauth_state(p_state text)
returns table (
  user_id       uuid,
  provider      text,
  code_verifier text,
  return_to     text
)
language sql
security definer
set search_path = ''
as $$
  delete from public.oauth_states
  where state = p_state
    and expires_at > clock_timestamp()
  returning user_id, provider, code_verifier, return_to;
$$;

revoke all on function public.consume_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_oauth_state(text) to service_role;

/** Housekeeping for abandoned attempts. */
create or replace function public.prune_oauth_states()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.oauth_states where expires_at < clock_timestamp();
$$;

revoke all on function public.prune_oauth_states() from public, anon, authenticated;
grant execute on function public.prune_oauth_states() to service_role;
