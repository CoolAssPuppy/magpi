-- Uploaded bytes are keyed ${space_id}/${document_id}/${filename}, so the first
-- path segment is the permission decision.
--
-- Storage answers a delete of a row RLS is hiding with success and an empty
-- result. A test that only checks the statement did not error would pass while
-- the caller had, in fact, deleted nothing and been told they deleted something.
-- Every delete here is followed by a count.

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d0000000-0000-4000-8000-000000000004', 'dave@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.org_members (org_id, user_id, role)
select org_id, 'd0000000-0000-4000-8000-000000000004', 'member'
from public.org_members where user_id = 'c0000000-0000-4000-8000-000000000003';

insert into public.spaces (id, org_id, kind, name)
values
  ('50000000-0000-4000-8000-00000000000a',
   (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001'),
   'team', 'Alice team'),
  ('50000000-0000-4000-8000-00000000000c',
   (select org_id from public.org_members where user_id = 'c0000000-0000-4000-8000-000000000003'),
   'team', 'Leadership');

insert into public.space_members (space_id, user_id, created_at)
values
  ('50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
   '2026-01-02 00:00:00+00'),
  ('50000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000003',
   '2026-01-02 00:00:00+00');

-- The bucket is declared in config.toml and created by the CLI, not by a
-- migration, so it is infrastructure this file would otherwise depend on
-- silently. When it is absent every object insert below fails the bucket foreign
-- key and the whole file aborts having run no assertions, which reads as a test
-- failure rather than a missing precondition. Creating it here costs nothing
-- when it already exists and makes the file self-sufficient.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata, version,
                             created_at, updated_at, last_accessed_at)
values
  ('5d000000-0000-4000-8000-00000000000a', 'documents',
   '50000000-0000-4000-8000-00000000000a/51000000-0000-4000-8000-00000000000a/plan.pdf',
   'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{"size": 1024, "mimetype": "application/pdf"}', 'v1',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'),
  ('5d000000-0000-4000-8000-00000000000c', 'documents',
   '50000000-0000-4000-8000-00000000000c/51000000-0000-4000-8000-00000000000c/comp.pdf',
   'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003',
   '{"size": 4096, "mimetype": "application/pdf"}', 'v1',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'),
  -- Alice's space id, but in the second segment. Only the first one counts.
  ('5d000000-0000-4000-8000-0000000000fc', 'documents',
   '50000000-0000-4000-8000-00000000000c/50000000-0000-4000-8000-00000000000a/decoy.pdf',
   'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003',
   '{"size": 32, "mimetype": "application/pdf"}', 'v1',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00');

-- Alice ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects
   where id = '5d000000-0000-4000-8000-00000000000a'),
  1, 'a user reads an object stored under a space they are in'
);

select is(
  (select count(*)::int from storage.objects
   where id = '5d000000-0000-4000-8000-00000000000c'),
  0, 'and reads nothing stored under a space they are not in'
);

select is(
  (select count(*)::int from storage.objects
   where id = '5d000000-0000-4000-8000-0000000000fc'),
  0, 'a readable space id further down the path grants nothing'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('documents',
             '50000000-0000-4000-8000-00000000000c/51000000-0000-4000-8000-00000000000c/forged.pdf',
             'a0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a user cannot write into a space they are not in'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('documents',
             '50000000-0000-4000-8000-00000000000a/51000000-0000-4000-8000-00000000001a/notes.pdf',
             'a0000000-0000-4000-8000-000000000001') $$,
  'a user may write into a space they are in'
);

select is(
  (select count(*)::int from storage.objects
   where name = '50000000-0000-4000-8000-00000000000a/51000000-0000-4000-8000-00000000001a/notes.pdf'),
  1, 'and the object is there afterwards'
);

-- The hidden delete ----------------------------------------------------------
--
-- storage.protect_delete refuses direct SQL deletes outright, which would mask
-- the RLS result behind an unrelated error. Lifting it for this statement leaves
-- the policy as the only thing deciding, which is what is under test.

set local storage.allow_delete_query to 'true';

select lives_ok(
  $$ delete from storage.objects where id = '5d000000-0000-4000-8000-00000000000c' $$,
  'deleting an object hidden by RLS is reported as success'
);

reset role;

select is(
  (select count(*)::int from storage.objects
   where id = '5d000000-0000-4000-8000-00000000000c'),
  1, 'and the object is still there'
);

select is(
  (select metadata->>'size' from storage.objects
   where id = '5d000000-0000-4000-8000-00000000000c'),
  '4096', 'with its stored bytes unchanged'
);

-- Dave, same org as Carol, outside her space -----------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects
   where id = '5d000000-0000-4000-8000-00000000000c'),
  0, 'a colleague in the same org cannot read the object either'
);

set local storage.allow_delete_query to 'true';

select lives_ok(
  $$ delete from storage.objects where id = '5d000000-0000-4000-8000-00000000000c' $$,
  'and their delete is reported as success too'
);

reset role;

select is(
  (select count(*)::int from storage.objects
   where id = '5d000000-0000-4000-8000-00000000000c'),
  1, 'and still removes nothing'
);

-- Carol, who is actually in the space ------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local storage.allow_delete_query to 'true';

delete from storage.objects where id = '5d000000-0000-4000-8000-00000000000c';

reset role;

select is(
  (select count(*)::int from storage.objects
   where id = '5d000000-0000-4000-8000-00000000000c'),
  0, 'a member of the space really can delete the object, so the policy is not simply off'
);

select * from finish();

rollback;
