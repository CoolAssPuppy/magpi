-- The functions the permission model rests on, and the posture of the schema
-- around them.
--
-- The single-use functions matter because both of them stand between an
-- intercepted URL and a usable provider token: a state or ticket that can be
-- redeemed twice is a token that can be filed under the wrong account.

begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- Carol is a plain member of Alice's org, so is_org_admin has a real negative
-- case rather than only a stranger.
insert into public.org_members (org_id, user_id, role)
select org_id, 'c0000000-0000-4000-8000-000000000003', 'member'
from public.org_members
where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner';

insert into public.spaces (id, org_id, kind, name)
values
  ('50000000-0000-4000-8000-00000000000a',
   (select org_id from public.org_members
    where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner'),
   'team', 'Alice team'),
  ('50000000-0000-4000-8000-00000000000b',
   (select org_id from public.org_members where user_id = 'b0000000-0000-4000-8000-000000000002'),
   'team', 'Bob team');

insert into public.space_members (space_id, user_id, created_at)
values
  ('50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
   '2026-01-02 00:00:00+00'),
  ('50000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002',
   '2026-01-02 00:00:00+00');

select set_config(
  'recall.org_a',
  (select org_id::text from public.org_members
   where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner'),
  true
);

select set_config(
  'recall.org_b',
  (select org_id::text from public.org_members
   where user_id = 'b0000000-0000-4000-8000-000000000002'),
  true
);

-- The predicates ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.visible_space_ids()),
  3, 'visible_space_ids returns the personal space, the org space and the one team space'
);

select ok(
  '50000000-0000-4000-8000-00000000000a' in (select public.visible_space_ids()),
  'and it holds the team space the caller joined'
);

select ok(
  '50000000-0000-4000-8000-00000000000b' not in (select public.visible_space_ids()),
  'and not another organization''s team space'
);

select ok(
  public.is_org_member(current_setting('recall.org_a')::uuid),
  'is_org_member is true for the caller''s own org'
);

select ok(
  not public.is_org_member(current_setting('recall.org_b')::uuid),
  'and false for an org they have nothing to do with'
);

select ok(
  public.is_org_admin(current_setting('recall.org_a')::uuid),
  'is_org_admin is true for the owner of the org'
);

set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select ok(
  not public.is_org_admin(current_setting('recall.org_a')::uuid),
  'and false for a plain member of the same org'
);

set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select ok(
  public.is_space_member('50000000-0000-4000-8000-00000000000a'),
  'is_space_member is true for a space the caller is in'
);

select ok(
  not public.is_space_member('50000000-0000-4000-8000-00000000000b'),
  'and false for one they are not'
);

-- Single-use exchanges -----------------------------------------------------------

reset role;

insert into public.providers (slug, display_name, kind, enabled)
values ('notion', 'Notion', 'api_key', true)
on conflict (slug) do nothing;

-- Fixed far-future and far-past expiries, so the comparison against the clock is
-- decided by the fixture and not by how long the suite took to get here.
insert into public.oauth_states (state, user_id, provider, code_verifier, space_id, expires_at, created_at)
values
  ('state-live', 'a0000000-0000-4000-8000-000000000001', 'notion', 'verifier-live',
   '50000000-0000-4000-8000-00000000000a', '2099-01-01 00:00:00+00', '2026-01-02 00:00:00+00'),
  ('state-stale', 'a0000000-0000-4000-8000-000000000001', 'notion', 'verifier-stale',
   '50000000-0000-4000-8000-00000000000a', '2020-01-01 00:00:00+00', '2019-12-31 00:00:00+00');

insert into public.pending_connections (ticket_hash, user_id, provider, space_id,
                                        access_token_enc, expires_at, created_at)
values ('ticket-live', 'a0000000-0000-4000-8000-000000000001', 'notion',
        '50000000-0000-4000-8000-00000000000a', '\xdeadbeef',
        '2099-01-01 00:00:00+00', '2026-01-02 00:00:00+00');

set local role service_role;

select is(
  (select code_verifier from public.consume_oauth_state('state-live')),
  'verifier-live', 'consume_oauth_state hands back the pending attempt once'
);

select is(
  (select count(*)::int from public.consume_oauth_state('state-live')),
  0, 'and a second callback with the same state gets nothing'
);

select is(
  (select count(*)::int from public.consume_oauth_state('state-stale')),
  0, 'an expired attempt is never handed back at all'
);

select is(
  (select user_id from public.consume_pending_connection('ticket-live')),
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'consume_pending_connection hands back the parked token once'
);

select is(
  (select count(*)::int from public.consume_pending_connection('ticket-live')),
  0, 'and a second attempt with the same ticket gets nothing'
);

-- Rate limiting -------------------------------------------------------------------
--
-- The counter lives in a table because an Edge Function is serverless: a
-- module-scope counter is per instance, so N warm instances would multiply the
-- effective limit by N.

select ok(
  (select allowed from public.consume_rate_limit('recall-test-bucket', 3, 3600)),
  'the first call inside the limit is allowed'
);

select ok(
  (select allowed from public.consume_rate_limit('recall-test-bucket', 3, 3600)),
  'and so is the second'
);

select ok(
  (select allowed from public.consume_rate_limit('recall-test-bucket', 3, 3600)),
  'the call that reaches the limit is still allowed'
);

select is(
  (select remaining from public.consume_rate_limit('recall-test-bucket', 3, 3600)),
  0, 'and by then there is nothing remaining'
);

select ok(
  not (select allowed from public.consume_rate_limit('recall-test-bucket', 3, 3600)),
  'the call past the limit is refused'
);

-- No client role holds these ---------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select * from public.consume_oauth_state('state-live') $$,
  '42501', null, 'a client role cannot redeem an oauth state'
);

select throws_ok(
  $$ select * from public.consume_pending_connection('ticket-live') $$,
  '42501', null, 'a client role cannot redeem a parked connection'
);

select throws_ok(
  $$ select * from public.consume_rate_limit('recall-test-bucket', 3, 3600) $$,
  '42501', null, 'a client role cannot spend somebody else''s rate limit'
);

-- Pruning is a delete of every in-flight OAuth attempt. A client that can call
-- it can end every sign-in to a provider that is currently in progress.
select throws_ok(
  $$ select public.prune_oauth_states() $$,
  '42501', null, 'a client role cannot prune the oauth state table'
);

reset role;

-- Posture -----------------------------------------------------------------------------

select ok(
  (select bool_and(c.relrowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'row level security is enabled on every table in public'
);

-- Without force, the table owner is exempt, and the owner is the role that
-- migrations and any definer function written without care run as.
select ok(
  (select bool_and(c.relforcerowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'and forced on every table in public'
);

select ok(
  not (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'search'),
  'public.search is security invoker, so a search runs as whoever asked'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('visible_space_ids', 'is_org_member', 'is_org_admin', 'is_space_member')
     and p.prosecdef),
  4, 'the four visibility predicates are security definer'
);

-- A definer function without a pinned search_path can be pointed at a shadow
-- table by whoever calls it.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) as cfg
                         where cfg like 'search\_path=%'))),
  0, 'every security definer function in public pins a search_path'
);

-- A revoke never survives `supabase db diff`, so every security definer function
-- added from here on will arrive in the database carrying the default execute to
-- PUBLIC, and PostgREST publishes anything in this schema as an RPC. That is how
-- the anon key came to be able to read a PKCE verifier. Nothing in public should
-- be executable by PUBLIC; if something ever legitimately is, allowlist it here
-- by name rather than deleting the assertion.
--
-- A null proacl is the default, which is execute to PUBLIC, so it counts too.
select is_empty(
  $$ select p.proname::text || '(' || pg_get_function_identity_arguments(p.oid) || ')'
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE')) $$,
  'no function in public is executable by PUBLIC'
);

-- Grants ---------------------------------------------------------------------------
--
-- A policy is only reachable if the role also holds the table privilege. These
-- two assertions are the other half of every isolation test in this suite:
-- without the grant the policies never run, and with too broad a grant they run
-- for a role they were never written for.

select ok(
  (select bool_and(has_table_privilege('authenticated', t, 'select'))
   from unnest(array['public.documents', 'public.chunks', 'public.spaces',
                     'public.space_members', 'public.entities', 'public.entity_mentions',
                     'public.dream_runs', 'public.dream_links', 'public.ingest_jobs',
                     'public.conversations', 'public.messages', 'public.organizations',
                     'public.org_members', 'public.providers', 'public.usage_events',
                     'public.model_calls']) as t),
  'authenticated holds select on the tables whose policies decide what it reads'
);

select ok(
  not (select bool_or(has_table_privilege('anon', c.oid, 'select'))
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'),
  'anon holds select on nothing in public'
);

-- connections is the one table granted by column list rather than whole, because
-- connections_select_visible would otherwise hand a client the provider tokens
-- along with the row. A column-level revoke cannot subtract from a table-level
-- grant, so the table privilege has to be absent in the first place. This is the
-- assertion that fails if someone reaches for `revoke select (access_token_enc)`
-- and believes it worked.
select ok(
  not has_table_privilege('authenticated', 'public.connections', 'select'),
  'a client holds no table-wide select on connections, only named columns'
);

select ok(
  has_column_privilege('authenticated', 'public.connections', 'status', 'select'),
  'a client can read the status of a connection'
);

-- The one column that turns a readable row into a usable credential.
select ok(
  not has_column_privilege('authenticated', 'public.connections', 'access_token_enc', 'select'),
  'but never the provider token stored on it'
);

select * from finish();

rollback;
