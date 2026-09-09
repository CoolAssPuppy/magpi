-- A dream run is scoped to exactly one space. It reads only that space and
-- writes only into that space, and its output is an ordinary document under the
-- ordinary document policy. A synthesis job that read across spaces under the
-- service role and surfaced the result would be a permission bypass with a
-- friendly name, so the boundary is asserted on every table the job touches.

begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

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

-- The digest points back at the run that wrote it. That back reference is what
-- makes a written row traceable to a space, and the structural check below
-- walks it.
update public.documents
set dream_run_id = '56000000-0000-4000-8000-00000000000c'
where id = '51000000-0000-4000-8000-0000000000fc';

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

-- Alice's own space, holding content the Leadership dream must never reach. The
-- two document ids are chosen to sort either side of the Leadership ones, so the
-- cross-space link can be built in both column positions without tripping the
-- document_a < document_b check.
insert into public.spaces (id, org_id, kind, name)
values ('50000000-0000-4000-8000-00000000000a',
        (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001'),
        'team', 'Alice team');

insert into public.space_members (space_id, user_id, created_at)
values ('50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
        '2026-01-02 00:00:00+00');

insert into public.documents (id, org_id, space_id, title, origin, created_at, updated_at)
values
  ('51000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', 'Alice acquisition memo', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'),
  ('51000000-0000-4000-8000-0000000000aa',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', 'Alice salary bands', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00');

insert into public.chunks (id, org_id, space_id, document_id, ordinal, content)
values ('52000000-0000-4000-8000-0000000000aa',
        (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
        '50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-0000000000aa',
        0, 'the staff engineer band tops out at 260');

-- The digest cites two chunks: one from its own space, one of Alice's. A dream
-- job has no business producing the second, but source_chunk_ids is a uuid[] and
-- an array column cannot carry a foreign key, so nothing declarative can refuse
-- it. What makes the column safe anyway is that the ids are resolved on read
-- through RLS, exactly as messages.citations is.
update public.documents
set source_chunk_ids = array['52000000-0000-4000-8000-00000000000c',
                             '52000000-0000-4000-8000-0000000000aa']::uuid[]
where id = '51000000-0000-4000-8000-0000000000fc';

-- An entity of Alice's, so the mention assertions have something in the wrong
-- space to reach for.
insert into public.entities (id, org_id, space_id, kind, name, canonical_name)
values ('54000000-0000-4000-8000-0000000000aa',
        (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
        '50000000-0000-4000-8000-00000000000a', 'decision', 'Salary review', 'salary-review');

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

-- The same rule the spec sets for message citations, on the other citation
-- column. The ids are stored; the text is resolved on read through RLS. That is
-- what makes an unenforceable array column safe, and it is the property that
-- breaks the day somebody adds a denormalised source_text column or resolves
-- citations through a security definer function.
select is(
  (select array_length(source_chunk_ids, 1) from public.documents
   where id = '51000000-0000-4000-8000-0000000000fc'),
  2, 'the digest records two source chunk ids'
);

select is(
  (select count(*)::int
   from public.documents d
   cross join lateral unnest(d.source_chunk_ids) as s(chunk_id)
   join public.chunks ch on ch.id = s.chunk_id
   where d.id = '51000000-0000-4000-8000-0000000000fc'),
  1, 'and a reader resolves only the one that is in a space they can see'
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

-- Everything a run wrote sits in the run's own space ----------------------------
--
-- One query over every table a dream job writes, walking each row back to the
-- run that produced it and comparing the two space ids. It runs as postgres, so
-- no policy hides a violation from the check itself.
--
-- Be clear about what this proves on its own: the fixture is mine, so the empty
-- result below is only as good as the rows I wrote. The second assertion is the
-- one that gives it meaning, by planting a bad row and showing the query names
-- it. What will catch a real regression is the constraint the four assertions at
-- the end of this file are asking for; this pair is the detector that goes with
-- it, and it doubles as the audit query to run against real data.

reset role;

select is_empty(
  $$
    select 'documents ' || d.id::text
    from public.documents d
    join public.dream_runs r on r.id = d.dream_run_id
    where d.space_id <> r.space_id
    union all
    select 'chunks ' || c.id::text
    from public.chunks c
    join public.documents d on d.id = c.document_id
    join public.dream_runs r on r.id = d.dream_run_id
    where c.space_id <> r.space_id
    union all
    select 'dream_links ' || l.id::text
    from public.dream_links l
    join public.dream_runs r on r.id = l.dream_run_id
    join public.documents da on da.id = l.document_a
    join public.documents db on db.id = l.document_b
    where l.space_id <> r.space_id
       or da.space_id <> l.space_id
       or db.space_id <> l.space_id
    union all
    select 'entity_mentions ' || m.id::text
    from public.entity_mentions m
    join public.chunks c on c.id = m.chunk_id
    join public.documents d on d.id = m.document_id
    where m.space_id <> c.space_id or m.space_id <> d.space_id
    union all
    -- entities carry no run reference of their own, so they are traced through
    -- the mentions that cite them.
    select 'entities ' || e.id::text
    from public.entities e
    join public.entity_mentions m on m.entity_id = e.id
    where e.space_id <> m.space_id
  $$,
  'no row a dream run wrote carries a space_id other than its run''s'
);

-- Plant one wrong row and prove the query names it, so the assertion above is
-- known to be looking rather than merely quiet.
--
-- The composite foreign keys refuse this row now, which is the whole point of
-- having them and also why it has to be planted with them dropped. They are not
-- deferrable, so there is no gentler way to reach the state the detector is for.
-- Dropping them here rather than planting the row in some branch the constraints
-- happen not to cover yet is deliberate: the next constraint that lands would
-- break that arrangement, and this one survives all of them.
--
-- Everything in this file rolls back, and they are restored on the next line so
-- the write-refusal assertions at the end still run against a constrained table.
alter table public.entity_mentions drop constraint entity_mentions_document_in_space;
alter table public.entity_mentions drop constraint entity_mentions_chunk_in_space;

insert into public.entity_mentions (id, entity_id, document_id, chunk_id, space_id)
values ('55000000-0000-4000-8000-0000000000ff', '54000000-0000-4000-8000-00000000000c',
        '51000000-0000-4000-8000-0000000000aa', '52000000-0000-4000-8000-0000000000aa',
        '50000000-0000-4000-8000-00000000000c');

select set_eq(
  $$
    select 'entity_mentions ' || m.id::text
    from public.entity_mentions m
    join public.chunks c on c.id = m.chunk_id
    join public.documents d on d.id = m.document_id
    where m.space_id <> c.space_id or m.space_id <> d.space_id
  $$,
  array['entity_mentions 55000000-0000-4000-8000-0000000000ff'],
  'and a mention filed in the wrong space is named by it'
);

delete from public.entity_mentions where id = '55000000-0000-4000-8000-0000000000ff';

alter table public.entity_mentions
  add constraint entity_mentions_chunk_in_space
    foreign key (chunk_id, space_id) references public.chunks (id, space_id) on delete cascade,
  add constraint entity_mentions_document_in_space
    foreign key (document_id, space_id) references public.documents (id, space_id) on delete cascade;

-- Deleting a dream output ------------------------------------------------------

set local role authenticated;
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

-- The row a dream must not be able to write --------------------------------------
--
-- Everything above tests what a reader may see. These four test what the writer
-- may put there, and they run as service_role on purpose, because service_role
-- has BYPASSRLS: no policy in this schema is evaluated for the dream job at all.
-- The space boundary the spec calls the security model is, for the one process
-- that writes across it, currently enforced by nothing but the correctness of
-- the job body.
--
-- dream_links.rationale is the reason this matters rather than being tidiness. It
-- is model-written prose describing both documents, and it is readable by every
-- member of the space the link is filed in. A link filed in Leadership naming a
-- document in Alice's space hands Leadership a written summary of a document
-- they cannot open.
--
-- The fix is declarative and needs no trigger: a unique constraint on
-- documents (id, space_id) and chunks (id, space_id), then composite foreign
-- keys from each of these columns carrying space_id along with the id.

set local role service_role;

select throws_ok(
  $$ insert into public.dream_links (dream_run_id, space_id, document_a, document_b,
                                     similarity, rationale)
     values ('56000000-0000-4000-8000-00000000000c',
             '50000000-0000-4000-8000-00000000000c',
             '51000000-0000-4000-8000-00000000000a',
             '51000000-0000-4000-8000-00000000000c',
             0.91, 'both describe the same acquisition') $$,
  '23503', null,
  'a dream link cannot name a document from outside the space it is filed in'
);

select throws_ok(
  $$ insert into public.dream_links (dream_run_id, space_id, document_a, document_b,
                                     similarity, rationale)
     values ('56000000-0000-4000-8000-00000000000c',
             '50000000-0000-4000-8000-00000000000c',
             '51000000-0000-4000-8000-00000000001c',
             '51000000-0000-4000-8000-0000000000aa',
             0.91, 'both describe the same salary decision') $$,
  '23503', null,
  'and not in the other column either'
);

select throws_ok(
  $$ update public.dream_runs
     set output_document_id = '51000000-0000-4000-8000-0000000000aa'
     where id = '56000000-0000-4000-8000-00000000000c' $$,
  '23503', null,
  'a dream run cannot point at an output document outside its own space'
);

select throws_ok(
  $$ insert into public.entity_mentions (entity_id, document_id, chunk_id, space_id)
     values ('54000000-0000-4000-8000-00000000000c',
             '51000000-0000-4000-8000-0000000000aa',
             '52000000-0000-4000-8000-0000000000aa',
             '50000000-0000-4000-8000-00000000000c') $$,
  '23503', null,
  'an entity mention cannot cite a chunk from outside the space it is filed in'
);

-- This one is not only about dreaming. Every writer of chunks reaches it, the
-- ingest pipeline included, and it is the worst of the set: chunks carry the
-- text, RLS on chunks is what public.search filters, so a chunk filed in the
-- wrong space makes another space's document searchable and readable in full.
-- Nothing ties chunks.document_id to the document's space today.
select throws_ok(
  $$ insert into public.chunks (org_id, space_id, document_id, ordinal, content)
     select org_id, '50000000-0000-4000-8000-00000000000c', id, 9,
            'the staff engineer band tops out at 260'
     from public.documents where id = '51000000-0000-4000-8000-0000000000aa' $$,
  '23503', null,
  'a chunk cannot be filed in a space its own document does not live in'
);

-- The three reference columns below leak nothing today, because RLS filters the
-- row on the other end of each one. They are asserted anyway: "the policy hides
-- it" is a second line of defence, and the day someone widens a policy in a
-- hurry is the day it stops being one.

select throws_ok(
  $$ update public.documents
     set dream_run_id = '56000000-0000-4000-8000-00000000000c'
     where id = '51000000-0000-4000-8000-0000000000aa' $$,
  '23503', null,
  'a document cannot be tagged with a dream run from another space'
);

select throws_ok(
  $$ insert into public.dream_links (dream_run_id, space_id, document_a, document_b,
                                     similarity, rationale)
     values ('56000000-0000-4000-8000-00000000000c',
             '50000000-0000-4000-8000-00000000000a',
             '51000000-0000-4000-8000-00000000000a',
             '51000000-0000-4000-8000-0000000000aa',
             0.7, 'filed in one space, produced by a run in another') $$,
  '23503', null,
  'a dream link cannot be filed against a run from another space'
);

select throws_ok(
  $$ insert into public.entity_mentions (entity_id, document_id, chunk_id, space_id)
     values ('54000000-0000-4000-8000-0000000000aa',
             '51000000-0000-4000-8000-00000000000c',
             '52000000-0000-4000-8000-00000000000c',
             '50000000-0000-4000-8000-00000000000c') $$,
  '23503', null,
  'an entity mention cannot cite an entity from another space'
);

-- There is no uncited synthesis. An empty array is a legitimate answer, meaning
-- the run found nothing worth writing about; a null is a digest whose citations
-- were never recorded, which is the same prose with no way to check it.
-- messages.citations already draws that line, as `jsonb not null default '[]'`
-- with a check that it is an array. This column wants the same:
--
--   alter table public.documents
--     alter column source_chunk_ids set default '{}',
--     alter column source_chunk_ids set not null;
select throws_ok(
  $$ insert into public.documents (org_id, space_id, title, origin, source_chunk_ids)
     values (current_setting('recall.org_c')::uuid,
             '50000000-0000-4000-8000-00000000000c',
             'Uncited digest', 'dream', null) $$,
  '23502', null,
  'a document cannot record a null set of source chunks'
);

reset role;

select * from finish();

rollback;
