-- Live pages. A badge checking in, or a page toggled in another tab, shows up
-- without a refresh.
--
-- Every table is published with an explicit column list rather than wholesale.
-- Realtime sends the row to the subscriber, so publishing `connections`
-- outright would put access_token_enc on the wire, and `badges` outright would
-- put token_hash there. RLS decides who is sent a row; the column list decides
-- what a row is, and only the second keeps a secret out of a browser.
--
-- The subscriber uses these events only as a signal to refetch through the
-- server, so connections_public stays the one shape a client ever reads.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- Revoking a connection deletes the row, and a delete carries only the
-- replica identity. Realtime reads user_id off that to decide who may be told,
-- and the default identity is the primary key alone, so a revoke would reach
-- nobody.
--
-- `replica identity full` is the obvious reach and it is wrong: it makes every
-- column the identity, and Postgres then rejects a publication whose column
-- list does not cover all of them. The unique key on this table is
-- (user_id, provider), which identifies the row, lets Realtime authorise, and
-- drags in no secret column.
alter table public.connections
  replica identity using index connections_user_id_provider_key;

-- page_configs is keyed on (user_id, page_slug) and so already carries
-- user_id. badges is renamed and revoked by update, which carries the primary
-- key and the changed columns.
alter table public.page_configs
  replica identity using index page_configs_user_id_page_slug_key;

alter publication supabase_realtime add table public.badges
  (id, user_id, badge_uid, label, fw, sdk, last_seen_at, battery_v, charging,
   created_at, revoked_at);

alter publication supabase_realtime add table public.page_configs
  (id, user_id, page_slug, enabled, position, settings, updated_at);

alter publication supabase_realtime add table public.connections
  (id, user_id, provider, external_account, scopes, expires_at, status,
   error_message, meta, created_at, updated_at);
