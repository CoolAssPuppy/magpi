-- Row level security and column privileges.
--
-- Default posture is deny. RLS is enabled and forced on every table; a table
-- with no policy is unreachable by anon and authenticated, which is the
-- intended state for device_codes and provider_cache. Edge functions reach
-- those with the service role, which bypasses RLS.

alter table public.profiles          enable row level security;
alter table public.device_codes      enable row level security;
alter table public.badges            enable row level security;
alter table public.providers         enable row level security;
alter table public.connections       enable row level security;
alter table public.page_configs      enable row level security;
alter table public.pomodoro_settings enable row level security;
alter table public.provider_cache    enable row level security;

-- Force RLS so the table owner is not implicitly exempt. Without this a
-- future security definer function owned by postgres reads past every policy
-- below.
alter table public.profiles          force row level security;
alter table public.device_codes      force row level security;
alter table public.badges            force row level security;
alter table public.providers         force row level security;
alter table public.connections       force row level security;
alter table public.page_configs      force row level security;
alter table public.pomodoro_settings force row level security;
alter table public.provider_cache    force row level security;

-- Profiles: a user reads and writes only their own.
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- device_codes: no policies. Pairing state is never client readable; exposing
-- user_code or status hands an attacker the oracle the lockout exists to deny.

-- Badges: a user sees and relabels their own, and revokes by setting
-- revoked_at. Inserts and token writes are service role only.
create policy badges_select_own on public.badges
  for select to authenticated using (user_id = (select auth.uid()));
create policy badges_update_own on public.badges
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Providers: any signed-in user reads the registry, which is what renders the
-- connections page. Writes are service role only.
create policy providers_select_authenticated on public.providers
  for select to authenticated using (true);

-- Connections: a user sees metadata for their own and may delete to revoke.
-- There is deliberately no insert or update policy; secrets are written only
-- by the edge functions under the service role.
create policy connections_select_own on public.connections
  for select to authenticated using (user_id = (select auth.uid()));
create policy connections_delete_own on public.connections
  for delete to authenticated using (user_id = (select auth.uid()));

-- Page configs and pomodoro settings hold no secrets, so a user owns them
-- outright.
create policy page_configs_select_own on public.page_configs
  for select to authenticated using (user_id = (select auth.uid()));
create policy page_configs_insert_own on public.page_configs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy page_configs_update_own on public.page_configs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy page_configs_delete_own on public.page_configs
  for delete to authenticated using (user_id = (select auth.uid()));

create policy pomodoro_select_own on public.pomodoro_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy pomodoro_insert_own on public.pomodoro_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy pomodoro_update_own on public.pomodoro_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- provider_cache: no policies. Reached only by the gateway.

-- Table privileges.
--
-- Granted explicitly rather than relying on schema defaults, so the reachable
-- surface is written down and a table added later is unreachable until
-- someone deliberately grants it. RLS narrows rows; these grants decide which
-- tables and columns exist at all for a role.
--
-- device_codes and provider_cache appear nowhere below. They are service role
-- only.

grant select, insert, update on public.profiles to authenticated;
grant select on public.providers to authenticated;
grant select, insert, update, delete on public.page_configs to authenticated;
grant select, insert, update on public.pomodoro_settings to authenticated;

-- Badges: select every column except the token hash, and update only two.
--
-- RLS filters rows, never columns, so badges_update_own alone would let a
-- user write any column of their own row, token_hash included. That is not a
-- relabelling, it is minting a working badge credential without pairing: set
-- the hash to the sha256 of a value you chose and every gateway call
-- authenticates. The column list is the control; the policy only picks the row.
grant select (id, user_id, badge_uid, label, token_version, fw, sdk,
              last_seen_at, battery_v, charging, created_at, revoked_at)
  on public.badges to authenticated;
grant update (label, revoked_at) on public.badges to authenticated;

-- Connections: column-level select, deliberately not table-level, so the
-- secret columns are absent from the grant rather than merely policy
-- protected. A table-level grant here would silently re-expose them.
grant select (id, user_id, provider, external_account, scopes, expires_at,
              status, error_message, meta, created_at, updated_at)
  on public.connections to authenticated;
grant delete on public.connections to authenticated;

-- Defence in depth. A future migration adding a table-level grant takes these
-- revokes with it, so the pgTAP tests assert the property rather than
-- trusting this line.
revoke select (access_token_enc, refresh_token_enc)
  on public.connections from authenticated, anon;
revoke select (token_hash) on public.badges from authenticated, anon;

-- The service role is the privileged path used by edge functions. It holds
-- BYPASSRLS, but privileges and RLS are separate systems: without these
-- grants every function call fails on permissions before RLS is consulted.
--
-- Granted per table rather than schema-wide so adding a table does not
-- silently extend the privileged surface.
grant select, insert, update, delete on
  public.profiles,
  public.device_codes,
  public.badges,
  public.providers,
  public.connections,
  public.page_configs,
  public.pomodoro_settings,
  public.provider_cache
  to service_role;

-- Client-facing projection of connections. security_invoker keeps the
-- caller's RLS in force, so this cannot read another user's rows, and the
-- secret columns are absent by construction.
create view public.connections_public
  with (security_invoker = true) as
  select id, user_id, provider, external_account, scopes, expires_at,
         status, error_message, meta, created_at, updated_at
  from public.connections;

grant select on public.connections_public to authenticated;
