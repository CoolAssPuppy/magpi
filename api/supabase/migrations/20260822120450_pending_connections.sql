-- Holds a freshly exchanged provider token until the browser that finished
-- the OAuth flow proves it belongs to the account the flow was started on.
--
-- Why this table exists at all. `oauth_states` is keyed by the state value
-- and carries the user id, and the callback used to credit that user id
-- directly. The state travels only in a URL, so anyone holding the URL could
-- decide which account a token landed on: start a flow on your own account,
-- send someone the link, and their provider token is filed under yours.
-- RFC 6749 10.12 asks for a value binding the callback to the user agent's
-- authenticated state. Nothing on this domain can supply one, because the
-- session cookie belongs to the web app's origin.
--
-- So the callback stops writing to `connections` and parks the result here.
-- `connections-claim` runs with the caller's verified JWT, and only a claim
-- whose session matches `user_id` is ever committed. A mismatch is an attack
-- signal, not a retry: the row is consumed and the token discarded.
--
-- The token is already encrypted under AAD `${user_id}:${provider}` when it
-- arrives, and `user_id` is unchanged by a successful claim, so the
-- ciphertext moves to `connections` as-is and is never decrypted here.

create table public.pending_connections (
  ticket_hash        text primary key,
  user_id            uuid not null references auth.users on delete cascade,
  provider           text not null references public.providers(slug),
  external_account   text,
  access_token_enc   bytea not null,
  refresh_token_enc  bytea,
  scopes             text[] not null default '{}',
  token_expires_at   timestamptz,
  return_to          text,
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now()
);

-- Only ever read by ticket, but the claim path deletes by user on sign-out
-- cascade and the pruner scans by expiry.
create index pending_connections_expires_at_idx on public.pending_connections (expires_at);

alter table public.pending_connections enable row level security;
alter table public.pending_connections force row level security;

-- No policies and no client grants, for the same reason `oauth_states` has
-- none: this table holds live token ciphertext, and the only code that may
-- touch it runs in an Edge Function with the service role.
grant select, insert, update, delete on public.pending_connections to service_role;

comment on table public.pending_connections is
  'Provider token awaiting an identity check by connections-claim. Single use.';

/**
 * Atomically consumes a pending row by ticket hash.
 *
 * Delete-and-return in one statement, so two claims racing on the same
 * ticket cannot both commit a connection.
 *
 * Deliberately does not filter on user id. The caller compares and audits
 * the mismatch, which is the signal that someone was handed a link they did
 * not start. Filtering here would delete the row and report nothing, making
 * the attack indistinguishable from an expired ticket.
 */
create or replace function public.consume_pending_connection(p_ticket_hash text)
returns table (
  user_id            uuid,
  provider           text,
  external_account   text,
  access_token_enc   bytea,
  refresh_token_enc  bytea,
  scopes             text[],
  token_expires_at   timestamptz,
  return_to          text
)
language sql
security definer
set search_path = ''
as $$
  delete from public.pending_connections
  where ticket_hash = p_ticket_hash
    and expires_at > clock_timestamp()
  returning user_id, provider, external_account, access_token_enc,
            refresh_token_enc, scopes, token_expires_at, return_to;
$$;

revoke all on function public.consume_pending_connection(text) from public, anon, authenticated;
grant execute on function public.consume_pending_connection(text) to service_role;

/** Housekeeping for flows abandoned between the callback and the claim. */
create or replace function public.prune_pending_connections()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.pending_connections where expires_at <= clock_timestamp();
$$;

revoke all on function public.prune_pending_connections() from public, anon, authenticated;
grant execute on function public.prune_pending_connections() to service_role;
