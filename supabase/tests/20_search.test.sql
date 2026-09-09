-- Two people ask the same question and get different answers, with no error and
-- no permission dialog, because RLS ran inside the vector search.
--
-- public.search is security invoker for exactly this reason. If it were ever
-- switched to security definer every assertion in this file would still be
-- written the same way and every one of them would be meaningless, which is why
-- the last assertion pins the volatility of the function itself.

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

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

insert into public.documents (id, org_id, space_id, title, origin, created_at, updated_at)
values
  ('51000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', 'Team plan', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'),
  ('51000000-0000-4000-8000-00000000000c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', 'Leadership plan', 'upload',
   '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00');

-- Vectors as text in session settings, so the search call itself needs no
-- helper function and no extra privilege to build its argument.
select set_config('recall.qvec',
  '[1,0,' || array_to_string(array_fill(0::real, array[1534]), ',') || ']', true);
select set_config('recall.vec_a',
  '[0.9,0.1,' || array_to_string(array_fill(0::real, array[1534]), ',') || ']', true);
select set_config('recall.vec_c',
  '[0.8,0.2,' || array_to_string(array_fill(0::real, array[1534]), ',') || ']', true);

-- Deliberately near-identical text. Both chunks answer the same question, so
-- nothing but the permission check separates them.
insert into public.chunks (id, org_id, space_id, document_id, ordinal, content, embedding)
values
  ('52000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a',
   0, 'the roadmap ships the launch in march',
   current_setting('recall.vec_a')::extensions.vector(1536)),
  ('52000000-0000-4000-8000-00000000000c',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000c'),
   '50000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000000c',
   0, 'the roadmap ships the launch in june after the board review',
   current_setting('recall.vec_c')::extensions.vector(1536));

-- Alice ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_eq(
  $$ select chunk_id from public.search(
       current_setting('recall.qvec')::extensions.vector(1536),
       'when does the roadmap ship', null, 20) $$,
  array['52000000-0000-4000-8000-00000000000a']::uuid[],
  'an unfiltered search returns only the chunks the caller can see'
);

select is(
  (select count(*)::int from public.search(
     current_setting('recall.qvec')::extensions.vector(1536),
     'when does the roadmap ship',
     array['50000000-0000-4000-8000-00000000000a']::uuid[], 20)),
  1, 'filtering to a space the caller is in returns that space''s chunks'
);

-- Naming a space you cannot see is not an escalation and not an error either.
-- The answer is simply that there is nothing there.
select lives_ok(
  $$ select * from public.search(
       current_setting('recall.qvec')::extensions.vector(1536),
       'when does the roadmap ship',
       array['50000000-0000-4000-8000-00000000000c']::uuid[], 20) $$,
  'filtering to a space the caller cannot see raises no error'
);

select is(
  (select count(*)::int from public.search(
     current_setting('recall.qvec')::extensions.vector(1536),
     'when does the roadmap ship',
     array['50000000-0000-4000-8000-00000000000c']::uuid[], 20)),
  0, 'and returns nothing rather than leaking the space'
);

-- A filter is a narrowing argument, never a grant. Asking for both spaces gets
-- you the one you are in.
select set_eq(
  $$ select chunk_id from public.search(
       current_setting('recall.qvec')::extensions.vector(1536),
       'when does the roadmap ship',
       array['50000000-0000-4000-8000-00000000000a',
             '50000000-0000-4000-8000-00000000000c']::uuid[], 20) $$,
  array['52000000-0000-4000-8000-00000000000a']::uuid[],
  'a filter naming both spaces still returns only the visible one'
);

-- Carol, same question, same index --------------------------------------------

set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select set_eq(
  $$ select chunk_id from public.search(
       current_setting('recall.qvec')::extensions.vector(1536),
       'when does the roadmap ship', null, 20) $$,
  array['52000000-0000-4000-8000-00000000000c']::uuid[],
  'the same query from the other side of the boundary returns the other row set'
);

select ok(
  not exists (
    select 1 from public.search(
      current_setting('recall.qvec')::extensions.vector(1536),
      'when does the roadmap ship', null, 20)
    where chunk_id = '52000000-0000-4000-8000-00000000000a'
  ),
  'and the two answers to the identical question share no chunk'
);

-- Bob, who has nothing indexed at all -----------------------------------------

set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.search(
     current_setting('recall.qvec')::extensions.vector(1536),
     'when does the roadmap ship', null, 20)),
  0, 'a caller with no indexed content gets an empty result, not somebody else''s'
);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select * from public.search(
       current_setting('recall.qvec')::extensions.vector(1536),
       'when does the roadmap ship', null, 20) $$,
  '42501', null, 'a signed-out caller cannot run the search at all'
);

reset role;

-- The whole permission model of retrieval rests on this one flag.
select ok(
  not (select prosecdef from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'search'),
  'public.search is security invoker, so RLS applies to whoever called it'
);

select * from finish();

rollback;
