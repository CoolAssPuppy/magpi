-- The core security file. A member of one space must not read another space's
-- rows, and the boundary has to hold between organizations and inside a single
-- organization, because "same company" is the case a team space exists to deny.
--
-- Every content table here is service-role-write-only by design, so each one
-- also gets a proof that a client role cannot write it.

begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

-- Four users. Alice and Bob are in separate organizations. Carol and Dave are in
-- the same organization, and only Carol is in the team space, so Dave is the
-- test that org membership alone grants nothing.
insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d0000000-0000-4000-8000-000000000004', 'dave@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- Dave joins Carol's organization. The trigger puts him in its org space.
insert into public.org_members (org_id, user_id, role)
select org_id, 'd0000000-0000-4000-8000-000000000004', 'member'
from public.org_members where user_id = 'c0000000-0000-4000-8000-000000000003';

-- One team space per owner, with fixed ids so every assertion below names a
-- constant rather than whatever the signup trigger generated.
insert into public.spaces (id, org_id, kind, name)
values
  ('50000000-0000-4000-8000-00000000000a',
   (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001'),
   'team', 'Alice team'),
  ('50000000-0000-4000-8000-00000000000b',
   (select org_id from public.org_members where user_id = 'b0000000-0000-4000-8000-000000000002'),
   'team', 'Bob team'),
  ('50000000-0000-4000-8000-00000000000c',
   (select org_id from public.org_members where user_id = 'c0000000-0000-4000-8000-000000000003'),
   'team', 'Carol team');

insert into public.space_members (space_id, user_id, created_at)
values
  ('50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', '2026-01-02 00:00:00+00'),
  ('50000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002', '2026-01-02 00:00:00+00'),
  ('50000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000003', '2026-01-02 00:00:00+00');

-- The registry is seeded by a migration in production. Connections carry a
-- foreign key to it, so the fixture needs a row of its own.
insert into public.providers (slug, display_name, kind, enabled)
values ('notion', 'Notion', 'api_key', true)
on conflict (slug) do nothing;

insert into public.connections (id, org_id, space_id, user_id, provider, external_account_id)
values
  ('53000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
   'notion', 'alice-workspace'),
  ('53000000-0000-4000-8000-00000000000c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000003',
   'notion', 'carol-workspace');

insert into public.documents (id, org_id, space_id, title, origin, created_at, updated_at)
values
  ('51000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', 'Alice roadmap', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'),
  ('51000000-0000-4000-8000-00000000001a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', 'Alice notes', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'),
  ('51000000-0000-4000-8000-00000000000c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', 'Carol compensation review', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'),
  ('51000000-0000-4000-8000-00000000001c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', 'Carol notes', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00');

insert into public.chunks (id, org_id, space_id, document_id, ordinal, content)
values
  ('52000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a',
   0, 'the alice roadmap ships in march'),
  ('52000000-0000-4000-8000-00000000000c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000000c',
   0, 'the carol compensation band is confidential');

insert into public.entities (id, org_id, space_id, kind, name, canonical_name)
values
  ('54000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', 'project', 'Roadmap', 'roadmap'),
  ('54000000-0000-4000-8000-00000000000c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', 'project', 'Comp review', 'comp-review');

insert into public.entity_mentions (id, entity_id, document_id, chunk_id, space_id)
values
  ('55000000-0000-4000-8000-00000000000a', '54000000-0000-4000-8000-00000000000a',
   '51000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-00000000000a',
   '50000000-0000-4000-8000-00000000000a'),
  ('55000000-0000-4000-8000-00000000000c', '54000000-0000-4000-8000-00000000000c',
   '51000000-0000-4000-8000-00000000000c', '52000000-0000-4000-8000-00000000000c',
   '50000000-0000-4000-8000-00000000000c');

insert into public.dream_runs (id, org_id, space_id, kind, status, created_at)
values
  ('56000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', 'digest', 'succeeded', '2026-01-04 00:00:00+00'),
  ('56000000-0000-4000-8000-00000000000c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', 'digest', 'succeeded', '2026-01-04 00:00:00+00');

insert into public.dream_links (id, dream_run_id, space_id, document_a, document_b, similarity, created_at)
values
  ('57000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-00000000000a',
   '50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a',
   '51000000-0000-4000-8000-00000000001a', 0.9, '2026-01-04 00:00:00+00'),
  ('57000000-0000-4000-8000-00000000000c', '56000000-0000-4000-8000-00000000000c',
   '50000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000000c',
   '51000000-0000-4000-8000-00000000001c', 0.9, '2026-01-04 00:00:00+00');

insert into public.ingest_jobs (id, org_id, space_id, document_id, created_at, updated_at)
values
  ('58000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a',
   '2026-01-05 00:00:00+00', '2026-01-05 00:00:00+00'),
  ('58000000-0000-4000-8000-00000000000c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000000c',
   '2026-01-05 00:00:00+00', '2026-01-05 00:00:00+00');

-- Carol's org id, stashed while the reader can still see it. Later assertions
-- run as Dave, who cannot read Carol's team space, so a subquery through that
-- space would return null and quietly turn a real check into a vacuous one.
select set_config(
  'recall.org_c',
  (select org_id::text from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
  true
);

-- Alice ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.documents
   where id in ('51000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000001a',
                '51000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000001c')),
  2, 'documents: a member sees only the documents in their own space'
);

select is(
  (select count(*)::int from public.chunks
   where id in ('52000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-00000000000c')),
  1, 'chunks: a member sees only the chunks in their own space'
);

select is(
  (select count(*)::int from public.connections
   where id in ('53000000-0000-4000-8000-00000000000a', '53000000-0000-4000-8000-00000000000c')),
  1, 'connections: a member sees only the connections in their own space'
);

select is(
  (select count(*)::int from public.entities
   where id in ('54000000-0000-4000-8000-00000000000a', '54000000-0000-4000-8000-00000000000c')),
  1, 'entities: a member sees only the entities in their own space'
);

select is(
  (select count(*)::int from public.entity_mentions
   where id in ('55000000-0000-4000-8000-00000000000a', '55000000-0000-4000-8000-00000000000c')),
  1, 'entity_mentions: a member sees only the mentions in their own space'
);

select is(
  (select count(*)::int from public.dream_runs
   where id in ('56000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-00000000000c')),
  1, 'dream_runs: a member sees only the runs in their own space'
);

select is(
  (select count(*)::int from public.dream_links
   where id in ('57000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-00000000000c')),
  1, 'dream_links: a member sees only the links in their own space'
);

select is(
  (select count(*)::int from public.ingest_jobs
   where id in ('58000000-0000-4000-8000-00000000000a', '58000000-0000-4000-8000-00000000000c')),
  1, 'ingest_jobs: a member sees only the jobs in their own space'
);

select is(
  (select count(*)::int from public.spaces
   where id in ('50000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-00000000000b',
                '50000000-0000-4000-8000-00000000000c')),
  1, 'spaces: a member sees only the team space they belong to'
);

select is(
  (select count(*)::int from public.space_members
   where space_id in ('50000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-00000000000b',
                      '50000000-0000-4000-8000-00000000000c')),
  1, 'space_members: a member sees the roster of their own space and no other'
);

-- Bob, in a different organization entirely --------------------------------

set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.documents
   where id in ('51000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000001a',
                '51000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000001c')),
  0, 'documents: another org sees none of them'
);

select is(
  (select count(*)::int from public.chunks
   where id in ('52000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-00000000000c')),
  0, 'chunks: another org sees none of them'
);

select is(
  (select count(*)::int from public.connections
   where id in ('53000000-0000-4000-8000-00000000000a', '53000000-0000-4000-8000-00000000000c')),
  0, 'connections: another org sees none of them'
);

select is(
  (select count(*)::int from public.entities
   where id in ('54000000-0000-4000-8000-00000000000a', '54000000-0000-4000-8000-00000000000c')),
  0, 'entities: another org sees none of them'
);

select is(
  (select count(*)::int from public.entity_mentions
   where id in ('55000000-0000-4000-8000-00000000000a', '55000000-0000-4000-8000-00000000000c')),
  0, 'entity_mentions: another org sees none of them'
);

select is(
  (select count(*)::int from public.dream_runs
   where id in ('56000000-0000-4000-8000-00000000000a', '56000000-0000-4000-8000-00000000000c')),
  0, 'dream_runs: another org sees none of them'
);

select is(
  (select count(*)::int from public.dream_links
   where id in ('57000000-0000-4000-8000-00000000000a', '57000000-0000-4000-8000-00000000000c')),
  0, 'dream_links: another org sees none of them'
);

select is(
  (select count(*)::int from public.ingest_jobs
   where id in ('58000000-0000-4000-8000-00000000000a', '58000000-0000-4000-8000-00000000000c')),
  0, 'ingest_jobs: another org sees none of them'
);

select is(
  (select count(*)::int from public.spaces
   where id in ('50000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-00000000000c')),
  0, 'spaces: another org does not see these team spaces'
);

select is(
  (select count(*)::int from public.space_members
   where space_id in ('50000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-00000000000c')),
  0, 'space_members: another org does not see these rosters'
);

-- Writes. These tables are written by the service role inside edge functions, so
-- every one of them has a select policy and nothing else. An update that the
-- policy hides reports success with zero rows changed, which is why the
-- dream_links case counts rows rather than trusting the statement.

select throws_ok(
  $$ insert into public.documents (org_id, space_id, title, origin)
     select org_id, id, 'forged', 'upload' from public.spaces
     where id = '50000000-0000-4000-8000-00000000000b' $$,
  '42501', null, 'documents: a client role cannot insert'
);

select throws_ok(
  $$ insert into public.chunks (org_id, space_id, document_id, ordinal, content)
     values ('00000000-0000-4000-8000-000000000000', '50000000-0000-4000-8000-00000000000b',
             '51000000-0000-4000-8000-00000000000a', 1, 'forged') $$,
  '42501', null, 'chunks: a client role cannot insert'
);

select throws_ok(
  $$ insert into public.connections (org_id, space_id, user_id, provider)
     values ('00000000-0000-4000-8000-000000000000', '50000000-0000-4000-8000-00000000000b',
             'b0000000-0000-4000-8000-000000000002', 'notion') $$,
  '42501', null, 'connections: a client role cannot insert'
);

select throws_ok(
  $$ insert into public.entities (org_id, space_id, kind, name, canonical_name)
     values ('00000000-0000-4000-8000-000000000000', '50000000-0000-4000-8000-00000000000b',
             'project', 'forged', 'forged') $$,
  '42501', null, 'entities: a client role cannot insert'
);

select throws_ok(
  $$ insert into public.entity_mentions (entity_id, document_id, chunk_id, space_id)
     values ('54000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a',
             '52000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-00000000000b') $$,
  '42501', null, 'entity_mentions: a client role cannot insert'
);

select throws_ok(
  $$ insert into public.dream_runs (org_id, space_id, kind)
     values ('00000000-0000-4000-8000-000000000000', '50000000-0000-4000-8000-00000000000b',
             'digest') $$,
  '42501', null, 'dream_runs: a client role cannot insert'
);

select throws_ok(
  $$ insert into public.dream_links (dream_run_id, space_id, document_a, document_b, similarity)
     values ('56000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-00000000000b',
             '51000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000001a', 0.5) $$,
  '42501', null, 'dream_links: a client role cannot insert'
);

select throws_ok(
  $$ insert into public.ingest_jobs (org_id, space_id, document_id)
     values ('00000000-0000-4000-8000-000000000000', '50000000-0000-4000-8000-00000000000b',
             '51000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'ingest_jobs: a client role cannot insert'
);

-- A user may create a team space. An org space would put every colleague in it,
-- so only the service role gets to make one.
select throws_ok(
  $$ insert into public.spaces (org_id, kind, name)
     select org_id, 'org', 'forged' from public.org_members
     where user_id = 'b0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'spaces: a client role cannot create an org space'
);

select throws_ok(
  $$ insert into public.space_members (space_id, user_id)
     values ('50000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'space_members: a user cannot add themselves to someone else''s space'
);

-- dream_links carries an update policy, so the statement succeeds and the RLS
-- filter is the only thing standing between Bob and Carol's row.
select lives_ok(
  $$ update public.dream_links set dismissed_at = '2026-01-06 00:00:00+00'
     where id = '57000000-0000-4000-8000-00000000000c' $$,
  'dream_links: an update against a hidden row reports success'
);

reset role;

select is(
  (select dismissed_at from public.dream_links where id = '57000000-0000-4000-8000-00000000000c'),
  null::timestamptz,
  'dream_links: and changed nothing, which is what that success meant'
);

-- Dave: same organization as Carol, not in her team space -------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}';

-- Proving Dave really is in the org first, so the zeroes below are the team
-- boundary rather than a missing org membership.
select is(
  (select count(*)::int from public.spaces
   where kind = 'org' and org_id = current_setting('recall.org_c')::uuid),
  1, 'a colleague in the same org does see that org''s org space'
);

select is(
  (select count(*)::int from public.documents
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  0, 'documents: a colleague outside the team space sees none of its documents'
);

select is(
  (select count(*)::int from public.chunks
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  0, 'chunks: a colleague outside the team space sees none of its chunks'
);

select is(
  (select count(*)::int from public.spaces
   where id = '50000000-0000-4000-8000-00000000000c'),
  0, 'spaces: a colleague outside the team space does not see the space itself'
);

select is(
  (select count(*)::int from public.space_members
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  0, 'space_members: a colleague outside the team space cannot read its roster'
);

set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.documents
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  2, 'and the owner of the team space does see them, so the fixture is real'
);

-- Anon ----------------------------------------------------------------------
--
-- Every content policy names `to authenticated`, so a signed-out caller is
-- refused at the table privilege before RLS is consulted at all. These assert
-- the refusal rather than an empty result: granting anon a broad select would
-- still return no rows today, and would silently become an exposure the moment
-- someone adds a policy that forgets the role list.

set local request.jwt.claims to '{"role":"anon"}';
set local role anon;

select throws_ok(
  'select * from public.documents', '42501', null,
  'a signed-out caller is refused documents outright'
);

select throws_ok(
  'select * from public.chunks', '42501', null,
  'a signed-out caller is refused chunks outright'
);

-- Realtime ------------------------------------------------------------------
--
-- Realtime resolves RLS against the old row on update and delete. Without a full
-- replica identity the old row is only its primary key, space_id is absent, and
-- the policy that filters on it cannot be evaluated, so a broadcast escapes the
-- space it belongs to.

reset role;

select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' $$,
  array['ingest_jobs', 'documents', 'dream_runs', 'connections', 'messages'],
  'the realtime publication holds exactly the five intended tables'
);

select ok(
  (select bool_and(c.relreplident = 'f')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('ingest_jobs', 'documents', 'dream_runs', 'connections', 'messages')),
  'every published table carries a full replica identity so its policy can run on the old row'
);

-- record_retrieval is security definer, so it writes documents that its caller
-- holds no update grant on. That makes the space check inside it the only thing
-- standing between a signed-in stranger and another organization's dead-content
-- panel, which is exactly the shape of the bugs this file exists to catch.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select public.record_retrieval(array[
       '51000000-0000-4000-8000-00000000000a'::uuid,
       '51000000-0000-4000-8000-00000000000c'::uuid
     ]) $$,
  'a reader may record a retrieval naming a document they cannot see'
);

reset role;

select is(
  (select retrieval_count from public.documents where id = '51000000-0000-4000-8000-00000000000a'),
  1::bigint, 'the document in her own space is counted'
);

select is(
  (select retrieval_count from public.documents where id = '51000000-0000-4000-8000-00000000000c'),
  0::bigint, 'the one in another organization is not, though she named it'
);

select isnt(
  (select last_retrieved_at from public.documents where id = '51000000-0000-4000-8000-00000000000a'),
  null, 'and the panel now has a date to read'
);

-- One connection per account per provider per space, including the account that
-- has no label. connections-claim matched an existing one with
-- `external_account_id = null`, which never matches, so every reconnect of a
-- provider that names no account filed another row holding a live token.
select throws_ok(
  $$ insert into public.connections (org_id, space_id, user_id, provider, external_account_id)
     values (
       (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
       '50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
       'notion', 'alice-workspace') $$,
  '23505',
  null,
  'the same provider account cannot be connected twice in one space'
);

insert into public.connections (org_id, space_id, user_id, provider, external_account_id)
values (
  (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
  '50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
  'notion', null);

-- A unique index counts every null as distinct, so this is the half a single
-- index over the nullable column would have let through, and it is the half
-- that actually broke.
select throws_ok(
  $$ insert into public.connections (org_id, space_id, user_id, provider, external_account_id)
     values (
       (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
       '50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
       'notion', null) $$,
  '23505',
  null,
  'nor can a provider that names no account at all'
);

-- The three columns that decide which organization owns a space, what kind it
-- is, and whose personal space it is. Nothing in the product updates any of
-- them after the row is created: the only two writes are the name and the
-- dreaming toggle.
--
-- The column grant already keeps `authenticated` out. This is the same rule for
-- every role, service_role included, and service_role is the key every Edge
-- Function holds. Promoting a team space to `kind = 'org'` is the escalation
-- that matters: `sync_org_space_membership` then enrols every future member of
-- the organization into it.
select throws_ok(
  $$ update public.spaces set kind = 'org'
     where id = '50000000-0000-4000-8000-00000000000a' $$,
  'P0001',
  'a space cannot change kind, organization or owner after it is created',
  'not even the service role may promote a team space to the org space'
);

select throws_ok(
  $$ update public.spaces set org_id = (
       select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000b')
     where id = '50000000-0000-4000-8000-00000000000a' $$,
  'P0001',
  'a space cannot change kind, organization or owner after it is created',
  'nor move it into another organization'
);

-- The two writes the product actually makes still work, which is what stops
-- this being a trigger that breaks the settings page.
select lives_ok(
  $$ update public.spaces set name = 'Renamed by the owner', dreaming_enabled = false
     where id = '50000000-0000-4000-8000-00000000000a' $$,
  'renaming a space and turning dreaming off are untouched'
);

select * from finish();

rollback;
