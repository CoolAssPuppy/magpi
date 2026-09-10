-- Space isolation across organizations and between team spaces inside one organization.

begin;

create extension if not exists pgtap with schema extensions;

select plan(56);

-- Four users: Alice and Bob in separate orgs, Carol and Dave in one, only Carol in the team.
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

-- One team space per owner, with fixed ids the assertions below name.
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

-- Connections carry a foreign key to the provider registry, so the fixture seeds a row.
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

-- Carol's org id, stashed now because the later assertions run as Dave, who cannot read it.
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

-- Writes. These tables carry a select policy only, and a hidden update reports success.

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

-- A user may create a team space; only the service role may create an org space.
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

-- dream_links carries an update policy, so the RLS filter is the only thing stopping Bob.
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

-- Dave is in the org first, so the zeroes below are the team boundary, not a missing row.
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

-- Anon: every policy names `to authenticated`, so a signed-out caller is refused outright. --

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

-- Realtime resolves RLS against the old row, which needs replica identity full. ------------

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

-- record_retrieval is security definer, so its own space check is the only barrier.
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

-- One connection per account per provider per space, including the account with no label.
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

-- A unique index counts every null as distinct, so the no-label case needs its own index.
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

-- org_id, kind and owner_user_id are immutable for every role, service_role included.
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

-- The two writes the product makes, the name and the dreaming toggle, still work.
select lives_ok(
  $$ update public.spaces set name = 'Renamed by the owner', dreaming_enabled = false
     where id = '50000000-0000-4000-8000-00000000000a' $$,
  'renaming a space and turning dreaming off are untouched'
);

-- Creating a team space, as the product does it.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- The SELECT policy applies to a RETURNING clause, and the creator is not a member yet.
select throws_ok(
  $$ insert into public.spaces (org_id, kind, name)
     select org_id, 'team', 'Refused by returning'
     from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001'
     returning id $$,
  '42501',
  'new row violates row-level security policy for table "spaces"',
  'a plain insert cannot read back the team space it just wrote'
);

select lives_ok(
  $$ select public.create_team_space(
       (select org_id from public.org_members
        where user_id = 'a0000000-0000-4000-8000-000000000001'),
       'Made by the function') $$,
  'create_team_space makes a team space for a member of the organization'
);

select is(
  (select count(*)::int from public.spaces where name = 'Made by the function'),
  1,
  'and the creator can see it'
);

select is(
  (select count(*)::int
   from public.space_members m
   join public.spaces s on s.id = m.space_id
   where s.name = 'Made by the function'
     and m.user_id = 'a0000000-0000-4000-8000-000000000001'),
  1,
  'and is a member of it'
);

select throws_ok(
  $$ select public.create_team_space('00000000-0000-4000-8000-0000000000ff', 'Not my org') $$,
  '42501',
  'not a member of that organization',
  'and cannot make one in an organization they are not in'
);

reset role;

select * from finish();

rollback;
