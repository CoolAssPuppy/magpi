-- The functions the permission model rests on, and the posture of the schema
-- around them.
--
-- The single-use functions matter because both of them stand between an
-- intercepted URL and a usable provider token: a state or ticket that can be
-- redeemed twice is a token that can be filed under the wrong account.

begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@magpi.test',
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

-- The assertion above catches a grant to PUBLIC and nothing else. A grant to
-- `authenticated` specifically passes it, and no table-privilege check covers
-- function privileges, so `grant execute on claim_ingest_jobs to authenticated`
-- would have been invisible to this entire suite. I checked rather than assumed.
--
-- So this one names the whole client-callable surface instead. It is a list of
-- what a client may call, not a list of what it may not, and that direction is
-- the point: a new service-role function nobody thought about is caught the
-- moment it becomes callable, while adding to the list is a deliberate act of
-- saying yes, a client may run this. The other direction rots silently.
--
-- claim_ingest_jobs is the case in point. It arrived security definer returning
-- SETOF ingest_jobs, so a client that could call it would read every queued job
-- in every organization and mark them all running on the way out.
select set_eq(
  $$ select p.proname::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            or has_function_privilege('anon', p.oid, 'EXECUTE')) $$,
  array['visible_space_ids', 'is_org_member', 'is_org_admin', 'is_space_member',
        'search', 'plan_document_limit', 'plan_monthly_query_limit',
        'check_ingest_allowed'],
  'the only functions a client role may execute are the eight meant to be callable'
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

-- Migration drift ---------------------------------------------------------------------
--
-- Both security bugs this suite has caught so far had the same root cause: the
-- schema files said one thing and the applied database said another, because
-- pg-delta dropped something on the way through. Everything above catches a
-- consequence we already know to look for. This catches the disagreement itself.
--
-- The expected set is written out by hand from supabase/schemas/95_grants.sql
-- rather than read back from the database, because an expectation derived from
-- the thing under test proves nothing. Getting a grant wrong now takes the same
-- mistake made twice, in two files, by two people.
--
-- It is a set comparison rather than a per-grant existence check so that it fails
-- in both directions: a grant that went missing, and a grant nobody declared.
--
-- TRUNCATE, REFERENCES, TRIGGER and MAINTAIN are excluded. Those come from the
-- stock Supabase defaults for every new table and say nothing about intent.
select set_eq(
  $$ select grantee::text || ' ' || table_name::text || ' ' || privilege_type::text
     from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated', 'service_role')
       and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE') $$,
  $$
    -- anon is absent on purpose. There is no unauthenticated surface, so any
    -- row appearing for it on the left is itself the failure.
    select 'authenticated ' || t || ' ' || p
    from (values
      ('organizations', 'SELECT'), ('organizations', 'UPDATE'),
      ('org_members', 'SELECT'), ('org_members', 'DELETE'),
      ('org_invites', 'SELECT'), ('org_invites', 'INSERT'), ('org_invites', 'DELETE'),
      -- No UPDATE. spaces is granted by column list so org_id and kind stay
      -- out, and a table grant here would put them back.
      ('spaces', 'SELECT'), ('spaces', 'INSERT'), ('spaces', 'DELETE'),
      ('space_members', 'SELECT'), ('space_members', 'INSERT'), ('space_members', 'DELETE'),
      ('providers', 'SELECT'),
      -- No SELECT. connections is granted by column list so the token columns
      -- stay out, and a table grant here would put them back.
      ('connections', 'DELETE'),
      ('documents', 'SELECT'), ('documents', 'DELETE'),
      ('chunks', 'SELECT'),
      ('entities', 'SELECT'),
      ('entity_mentions', 'SELECT'),
      ('dream_runs', 'SELECT'),
      ('dream_links', 'SELECT'), ('dream_links', 'UPDATE'),
      ('ingest_jobs', 'SELECT'),
      ('conversations', 'SELECT'), ('conversations', 'INSERT'),
      ('conversations', 'UPDATE'), ('conversations', 'DELETE'),
      ('messages', 'SELECT'), ('messages', 'INSERT'),
      ('usage_events', 'SELECT'),
      ('model_calls', 'SELECT')
    ) as g(t, p)
    union all
    -- service_role holds all four on every table it touches, so the tables are
    -- listed once and crossed with the privileges rather than repeated 88 times.
    select 'service_role ' || t || ' ' || p
    from (values
      ('organizations'), ('org_members'), ('org_invites'), ('spaces'),
      ('space_members'), ('providers'), ('connections'), ('documents'),
      ('chunks'), ('entities'), ('entity_mentions'), ('dream_runs'),
      ('dream_links'), ('ingest_jobs'), ('conversations'), ('messages'),
      ('usage_events'), ('model_calls'),
      -- Granted in their own schema files, not in 95_grants.sql, and reachable
      -- by no other role at all.
      ('oauth_states'), ('pending_connections'), ('rate_limits'), ('stripe_events')
    ) as s(t)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as pr(p)
  $$,
  'the applied table privileges are exactly the ones the schema files declare'
);

-- The same comparison for function execute privileges, written out by hand from
-- supabase/schemas/80_functions.sql. The one above covers tables and says nothing
-- about functions, which is where the drift actually was: eleven of the eighteen
-- had their revoke only in migrations/20260909161000, so a shadow database built
-- from schemas/ alone handed every one of them back to PUBLIC and no diff would
-- have mentioned it.
--
-- It reads proacl as stored rather than asking has_function_privilege, because
-- the question is what the schema files declared and not what a role can reach
-- through inheritance. A null proacl is expanded to the default first, so a
-- function whose revoke went missing appears here as a grant to PUBLIC rather
-- than as no row at all, which is the whole failure being tested for.
--
-- Only the roles a client can reach are compared. service_role is the database's
-- own credential and already holds every table privilege in the assertion above,
-- so a row for it proves nothing in either direction.
select set_eq(
  $$ select r.role_name || ' ' || p.proname::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     cross join lateral (
       select case when a.grantee = 0 then 'PUBLIC'
                   else pg_get_userbyid(a.grantee)::text end
     ) as r(role_name)
     where n.nspname = 'public'
       and a.privilege_type = 'EXECUTE'
       and r.role_name in ('PUBLIC', 'anon', 'authenticated') $$,
  $$
    -- anon and PUBLIC are absent on purpose, the same way anon is absent from
    -- the table comparison. A row for either on the left is itself the failure.
    select 'authenticated ' || f
    from (values
      ('visible_space_ids'), ('is_org_member'), ('is_org_admin'), ('is_space_member'),
      ('search'), ('plan_document_limit'), ('plan_monthly_query_limit'),
      ('check_ingest_allowed')
    ) as c(f)
  $$,
  'the applied function execute privileges are exactly the ones 80_functions.sql declares'
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

-- spaces is the second column-list grant, for the same reason and with a worse
-- consequence. spaces_update_member tested membership and nothing else, so a
-- table-wide update let a member run `update spaces set org_id = <another org>`
-- and carry the space, its documents, its chunks and its usage into an
-- organization they were never a member of. Renaming is the only thing a member
-- was ever meant to do here.
select ok(
  not has_table_privilege('authenticated', 'public.spaces', 'update'),
  'a member holds no table-wide update on spaces, only named columns'
);

select ok(
  has_column_privilege('authenticated', 'public.spaces', 'name', 'update')
    and has_column_privilege('authenticated', 'public.spaces', 'dreaming_enabled', 'update'),
  'a member can rename a space and turn dreaming off'
);

-- The two columns that decide which organization owns the rows and who can
-- reach them.
select ok(
  not has_column_privilege('authenticated', 'public.spaces', 'org_id', 'update')
    and not has_column_privilege('authenticated', 'public.spaces', 'kind', 'update'),
  'but never move it between organizations or change what kind of space it is'
);

select * from finish();

rollback;
