-- A dream run is scoped to exactly one space. It reads only that space and
-- writes only into that space, and its output is an ordinary document under the
-- ordinary document policy. A synthesis job that read across spaces under the
-- service role and surfaced the result would be a permission bypass with a
-- friendly name, so the boundary is asserted on every table the job touches.

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d0000000-0000-4000-8000-000000000004', 'dave@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- Dave is Carol's colleague. Alice is a stranger. Neither belongs in the space
-- the dream runs in.
insert into public.org_members (org_id, user_id, role)
select org_id, 'd0000000-0000-4000-8000-000000000004', 'member'
from public.org_members where user_id = 'c0000000-0000-4000-8000-000000000003';

insert into public.spaces (id, org_id, kind, name)
values ('50000000-0000-4000-8000-00000000000c',
        (select org_id from public.org_members
         where user_id = 'c0000000-0000-4000-8000-000000000003'),
        'team', 'Leadership');

insert into public.space_members (space_id, user_id, created_at)
values ('50000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000003',
        '2026-01-02 00:00:00+00');

select set_config(
  'recall.org_c',
  (select org_id::text from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
  true
);

-- Two sources and one synthesis written back into the same space.
insert into public.documents (id, org_id, space_id, title, origin, created_at, updated_at)
values
  ('51000000-0000-4000-8000-00000000000c', current_setting('recall.org_c')::uuid,
   '50000000-0000-4000-8000-00000000000c', 'Q1 board notes', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'),
  ('51000000-0000-4000-8000-00000000001c', current_setting('recall.org_c')::uuid,
   '50000000-0000-4000-8000-00000000000c', 'Q1 hiring plan', 'sync',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'),
  ('51000000-0000-4000-8000-0000000000fc', current_setting('recall.org_c')::uuid,
   '50000000-0000-4000-8000-00000000000c', 'What Q1 was about', 'dream',
   '2026-01-05 00:00:00+00', '2026-01-05 00:00:00+00');

insert into public.chunks (id, org_id, space_id, document_id, ordinal, content)
values
  ('52000000-0000-4000-8000-00000000000c', current_setting('recall.org_c')::uuid,
   '50000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000000c',
   0, 'the board asked for a hiring freeze'),
  ('52000000-0000-4000-8000-00000000001c', current_setting('recall.org_c')::uuid,
   '50000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000001c',
   0, 'the hiring plan adds six engineers');

insert into public.dream_runs (id, org_id, space_id, kind, status, started_at, finished_at,
                               input_document_count, output_document_id, created_at)
values ('56000000-0000-4000-8000-00000000000c', current_setting('recall.org_c')::uuid,
        '50000000-0000-4000-8000-00000000000c', 'digest', 'succeeded',
        '2026-01-05 03:00:00+00', '2026-01-05 03:04:00+00', 2,
        '51000000-0000-4000-8000-0000000000fc', '2026-01-05 03:00:00+00');

insert into public.dream_links (id, dream_run_id, space_id, document_a, document_b,
                               similarity, rationale, created_at)
values ('57000000-0000-4000-8000-00000000000c', '56000000-0000-4000-8000-00000000000c',
        '50000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000000c',
        '51000000-0000-4000-8000-00000000001c', 0.83,
        'both describe the Q1 headcount decision', '2026-01-05 03:03:00+00');

insert into public.entities (id, org_id, space_id, kind, name, canonical_name, summary)
values ('54000000-0000-4000-8000-00000000000c', current_setting('recall.org_c')::uuid,
        '50000000-0000-4000-8000-00000000000c', 'decision', 'Hiring freeze',
        'hiring-freeze', 'The board asked for a freeze in Q1.');

insert into public.entity_mentions (id, entity_id, document_id, chunk_id, space_id)
values ('55000000-0000-4000-8000-00000000000c', '54000000-0000-4000-8000-00000000000c',
        '51000000-0000-4000-8000-00000000000c', '52000000-0000-4000-8000-00000000000c',
        '50000000-0000-4000-8000-00000000000c');

-- Inside the space -----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.dream_runs
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  1, 'a member of the space sees the dream run'
);

select is(
  (select count(*)::int from public.dream_links
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  1, 'and the links it proposed'
);

select is(
  (select count(*)::int from public.entities
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  1, 'and the entities it extracted'
);

select is(
  (select count(*)::int from public.entity_mentions
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  1, 'and the mentions that back them'
);

-- Dream output is a document. No second permission model.
select is(
  (select count(*)::int from public.documents
   where id = '51000000-0000-4000-8000-0000000000fc' and origin = 'dream'),
  1, 'and the digest the run wrote, which is a document like any other'
);

-- A colleague in the same org, outside the space ------------------------------

set local request.jwt.claims to '{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}';

select is(
  (select count(*)::int from public.dream_runs
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  0, 'a colleague outside the space sees no dream run'
);

select is(
  (select count(*)::int from public.dream_links
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  0, 'no dream links'
);

select is(
  (select count(*)::int from public.entities
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  0, 'no entities'
);

select is(
  (select count(*)::int from public.entity_mentions
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  0, 'no entity mentions'
);

-- The dream is where a cross-space leak would actually happen: a digest is a
-- readable summary of everything the run saw, so it has to be governed exactly
-- like the sources it read.
select is(
  (select count(*)::int from public.documents
   where id = '51000000-0000-4000-8000-0000000000fc'),
  0, 'and no digest, which is the row that would have summarised the space for them'
);

-- A stranger in another organization ------------------------------------------

set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.dream_runs
   where space_id = '50000000-0000-4000-8000-00000000000c'),
  0, 'another organization sees no dream run'
);

-- Deleting a dream output ------------------------------------------------------

set local request.jwt.claims to '{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}';

select lives_ok(
  $$ delete from public.documents where id = '51000000-0000-4000-8000-0000000000fc' $$,
  'a colleague outside the space can issue the delete without error'
);

reset role;

select is(
  (select count(*)::int from public.documents
   where id = '51000000-0000-4000-8000-0000000000fc'),
  1, 'and the digest is untouched, which is what that success meant'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

-- The delete policy is narrowed to origin = 'dream' so that dismissing a digest
-- can never take a source with it.
select lives_ok(
  $$ delete from public.documents where id = '51000000-0000-4000-8000-00000000000c' $$,
  'a member can issue a delete against a source document without error'
);

reset role;

select is(
  (select count(*)::int from public.documents
   where id = '51000000-0000-4000-8000-00000000000c'),
  1, 'and the source document is still there'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select lives_ok(
  $$ delete from public.documents where id = '51000000-0000-4000-8000-0000000000fc' $$,
  'a member of the space may delete the dream output'
);

select is(
  (select count(*)::int from public.documents
   where id = '51000000-0000-4000-8000-0000000000fc'),
  0, 'and this time it is gone'
);

reset role;

select is(
  (select count(*)::int from public.documents
   where id in ('51000000-0000-4000-8000-00000000000c',
                '51000000-0000-4000-8000-00000000001c')),
  2, 'deleting a dream output does not delete the documents it was made from'
);

select is(
  (select count(*)::int from public.chunks
   where document_id in ('51000000-0000-4000-8000-00000000000c',
                         '51000000-0000-4000-8000-00000000001c')),
  2, 'nor the chunks of those documents'
);

-- output_document_id is on delete set null, so the run survives as a record of
-- what happened even after its output is dismissed.
select is(
  (select output_document_id from public.dream_runs
   where id = '56000000-0000-4000-8000-00000000000c'),
  null::uuid,
  'the run itself survives, with no output left to point at'
);

select * from finish();

rollback;
