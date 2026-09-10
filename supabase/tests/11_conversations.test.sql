-- Conversations belong to a user. Messages inherit through them, and citations resolve on read.

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.spaces (id, org_id, kind, name)
values ('50000000-0000-4000-8000-00000000000a',
        (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001'),
        'team', 'Leadership');

insert into public.space_members (space_id, user_id, created_at)
values ('50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
        '2026-01-02 00:00:00+00');

insert into public.documents (id, org_id, space_id, title, origin, created_at, updated_at)
values ('51000000-0000-4000-8000-00000000000a',
        (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
        '50000000-0000-4000-8000-00000000000a', 'Leadership offsite', 'upload',
        '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00');

insert into public.chunks (id, org_id, space_id, document_id, ordinal, content)
values
  ('52000000-0000-4000-8000-00000000000a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a',
   0, 'the offsite decided to delay the launch'),
  ('52000000-0000-4000-8000-00000000001a',
   (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
   '50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a',
   1, 'the launch moves to the second quarter');

insert into public.conversations (id, org_id, user_id, title, created_at, updated_at)
values
  ('59000000-0000-4000-8000-00000000000a',
   (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001'),
   'a0000000-0000-4000-8000-000000000001', 'When does the launch land',
   '2026-01-04 00:00:00+00', '2026-01-04 00:00:00+00'),
  ('59000000-0000-4000-8000-00000000000b',
   (select org_id from public.org_members where user_id = 'b0000000-0000-4000-8000-000000000002'),
   'b0000000-0000-4000-8000-000000000002', 'Unrelated',
   '2026-01-04 00:00:00+00', '2026-01-04 00:00:00+00');

insert into public.messages (id, conversation_id, role, content, citations, created_at)
values
  ('5a000000-0000-4000-8000-00000000000a', '59000000-0000-4000-8000-00000000000a',
   'user', 'when does the launch land', '[]', '2026-01-04 00:01:00+00'),
  ('5a000000-0000-4000-8000-00000000001a', '59000000-0000-4000-8000-00000000000a',
   'assistant', 'The offsite moved it to the second quarter.',
   '["52000000-0000-4000-8000-00000000000a", "52000000-0000-4000-8000-00000000001a"]',
   '2026-01-04 00:01:02+00');

-- Alice ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.conversations
   where id in ('59000000-0000-4000-8000-00000000000a', '59000000-0000-4000-8000-00000000000b')),
  1, 'a user sees only their own conversations'
);

select is(
  (select count(*)::int from public.messages
   where conversation_id = '59000000-0000-4000-8000-00000000000a'),
  2, 'and every message in one of them'
);

select lives_ok(
  $$ insert into public.messages (conversation_id, role, content)
     values ('59000000-0000-4000-8000-00000000000a', 'user', 'and who decided that') $$,
  'a user may add a message to their own conversation'
);

select is(
  (select count(*)::int from public.messages
   where conversation_id = '59000000-0000-4000-8000-00000000000a'),
  3, 'and the message actually landed'
);

-- The using clause passes since Alice owns the row; the with check blocks the reassignment.
select throws_ok(
  $$ update public.conversations
     set user_id = 'b0000000-0000-4000-8000-000000000002'
     where id = '59000000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'a user cannot reassign their conversation to another account'
);

-- Bob -----------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.conversations
   where id = '59000000-0000-4000-8000-00000000000a'),
  0, 'another user cannot see the conversation even knowing its id'
);

select is(
  (select count(*)::int from public.messages
   where conversation_id = '59000000-0000-4000-8000-00000000000a'),
  0, 'and cannot see any of its messages'
);

select throws_ok(
  $$ insert into public.messages (conversation_id, role, content)
     values ('59000000-0000-4000-8000-00000000000a', 'user', 'injected') $$,
  '42501', null, 'another user cannot insert a message into it'
);

select throws_ok(
  $$ insert into public.conversations (org_id, user_id, title)
     select org_id, 'a0000000-0000-4000-8000-000000000001', 'forged'
     from public.org_members where user_id = 'b0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'another user cannot open a conversation in someone else''s name'
);

-- A delete filtered to nothing reports success, so only the count afterwards proves anything.
select lives_ok(
  $$ delete from public.conversations where id = '59000000-0000-4000-8000-00000000000a' $$,
  'a delete of a hidden conversation reports success'
);

reset role;

select is(
  (select count(*)::int from public.conversations
   where id = '59000000-0000-4000-8000-00000000000a'),
  1, 'and the conversation is still there'
);

-- Citations ------------------------------------------------------------------
-- Chunk ids only. The read path joins them through RLS, so losing access is retroactive.

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int
   from public.messages m
   cross join lateral jsonb_array_elements_text(m.citations) as c(chunk_id)
   join public.chunks ch on ch.id = c.chunk_id::uuid
   where m.id = '5a000000-0000-4000-8000-00000000001a'),
  2, 'a member of the cited space resolves both citations'
);

reset role;

delete from public.space_members
where space_id = '50000000-0000-4000-8000-00000000000a'
  and user_id = 'a0000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int
   from public.messages m
   cross join lateral jsonb_array_elements_text(m.citations) as c(chunk_id)
   join public.chunks ch on ch.id = c.chunk_id::uuid
   where m.id = '5a000000-0000-4000-8000-00000000001a'),
  0, 'after removal from the space the citations resolve to nothing'
);

select is(
  (select count(*)::int from public.messages
   where id = '5a000000-0000-4000-8000-00000000001a'),
  1, 'while the message itself is still readable by its author'
);

-- The ids stay on the row. Only the resolution changed, along with the space membership.
select is(
  (select jsonb_array_length(citations)::int from public.messages
   where id = '5a000000-0000-4000-8000-00000000001a'),
  2, 'and the citation ids are still recorded on it'
);

select * from finish();

rollback;
