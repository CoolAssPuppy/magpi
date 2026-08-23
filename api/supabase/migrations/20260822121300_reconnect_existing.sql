-- Reconnecting one account, rather than adding another.
--
-- A connection whose token has gone stale needs replacing, not duplicating,
-- and since a provider can now hold several accounts the flow has to say which
-- one it is refreshing. The id rides from the authorize request through to the
-- claim; null means this is a new account.
--
-- on delete cascade: if the connection is removed while its flow is in the
-- air, the flow goes with it rather than completing against nothing.
alter table public.oauth_states
  add column connection_id uuid references public.connections on delete cascade;

alter table public.pending_connections
  add column connection_id uuid references public.connections on delete cascade;

comment on column public.oauth_states.connection_id is
  'Which connection this flow refreshes. Null when it is a new one.';

-- The callback reads the state through this, so the id has to come back with
-- it. A returns-table signature is fixed at creation, so it is replaced.
drop function public.consume_oauth_state(text);

create function public.consume_oauth_state(p_state text)
returns table (
  user_id       uuid,
  provider      text,
  code_verifier text,
  return_to     text,
  connection_id uuid
)
language sql
security definer
set search_path = ''
as $$
  delete from public.oauth_states
  where state = p_state
    and expires_at > clock_timestamp()
  returning user_id, provider, code_verifier, return_to, connection_id;
$$;

revoke all on function public.consume_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_oauth_state(text) to service_role;

-- Same shape of miss as consume_oauth_state above: adding the column to the
-- table does nothing if the function that reads it back still lists the old
-- columns. Without this the claim always saw an undefined connection and took
-- the insert branch, so every reconnect added an account instead of
-- refreshing one.
drop function public.consume_pending_connection(text);

create function public.consume_pending_connection(p_ticket_hash text)
returns table (
  user_id            uuid,
  provider           text,
  external_account   text,
  access_token_enc   bytea,
  refresh_token_enc  bytea,
  scopes             text[],
  token_expires_at   timestamptz,
  return_to          text,
  connection_id      uuid
)
language sql
security definer
set search_path = ''
as $$
  delete from public.pending_connections
  where ticket_hash = p_ticket_hash
    and expires_at > clock_timestamp()
  returning user_id, provider, external_account, access_token_enc,
            refresh_token_enc, scopes, token_expires_at, return_to,
            connection_id;
$$;

revoke all on function public.consume_pending_connection(text) from public, anon, authenticated;
grant execute on function public.consume_pending_connection(text) to service_role;
