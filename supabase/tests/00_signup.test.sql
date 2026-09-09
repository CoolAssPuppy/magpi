-- Signup builds the permission model. Every later isolation test assumes the
-- shape this trigger produces, so if the shape is wrong those tests pass while
-- guarding nothing.

begin;

-- plan() lives in pgtap, so the extension has to exist before the plan line.
create extension if not exists pgtap with schema extensions;

select plan(12);

-- Fixed ids and a fixed instance id. Nothing in this file depends on the clock.
insert into auth.users (id, email, instance_id, aud, role)
values ('a0000000-0000-4000-8000-000000000001', 'alice@magpi.test',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- Bob signs up second. Alice's org must be untouched by it.
insert into auth.users (id, email, instance_id, aud, role)
values ('b0000000-0000-4000-8000-000000000002', 'bob@magpi.test',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

select is(
  (select count(*)::int from public.org_members
   where user_id = 'a0000000-0000-4000-8000-000000000001'),
  1, 'signing up creates exactly one organization for the new user'
);

-- The first member of an org has to be able to invite and to change the plan.
-- Anything below owner leaves a brand new org with nobody who can administer it.
select is(
  (select role::text from public.org_members
   where user_id = 'a0000000-0000-4000-8000-000000000001'),
  'owner', 'the user who created the org is its owner'
);

select is(
  (select count(*)::int from public.spaces s
   join public.org_members m on m.org_id = s.org_id
   where m.user_id = 'a0000000-0000-4000-8000-000000000001'
     and s.kind = 'personal'
     and s.owner_user_id = 'a0000000-0000-4000-8000-000000000001'),
  1, 'signing up creates exactly one personal space owned by the new user'
);

select is(
  (select count(*)::int from public.spaces s
   join public.org_members m on m.org_id = s.org_id
   where m.user_id = 'a0000000-0000-4000-8000-000000000001'
     and s.kind = 'org'),
  1, 'signing up creates exactly one org space'
);

select is(
  (select count(*)::int from public.spaces s
   join public.org_members m on m.org_id = s.org_id
   where m.user_id = 'a0000000-0000-4000-8000-000000000001'),
  2, 'and no third space appears alongside them'
);

select is(
  (select count(*)::int from public.space_members
   where user_id = 'a0000000-0000-4000-8000-000000000001'),
  2, 'signing up creates exactly two space_members rows'
);

select set_eq(
  $$ select s.kind::text from public.space_members sm
     join public.spaces s on s.id = sm.space_id
     where sm.user_id = 'a0000000-0000-4000-8000-000000000001' $$,
  array['personal', 'org'],
  'the two memberships are the personal space and the org space'
);

-- "Only I can see it" is the entire promise of a personal space.
select is(
  (select count(*)::int from public.space_members sm
   join public.spaces s on s.id = sm.space_id
   where s.kind = 'personal'
     and s.owner_user_id = 'a0000000-0000-4000-8000-000000000001'),
  1, 'a personal space has exactly one member'
);

select isnt(
  (select org_id from public.org_members
   where user_id = 'b0000000-0000-4000-8000-000000000002'),
  (select org_id from public.org_members
   where user_id = 'a0000000-0000-4000-8000-000000000001'),
  'a second signup lands in its own organization'
);

select is(
  (select count(*)::int from public.org_members om
   where om.user_id = 'b0000000-0000-4000-8000-000000000002'
     and om.org_id in (select org_id from public.org_members
                       where user_id = 'a0000000-0000-4000-8000-000000000001')),
  0, 'a second signup does not join the first user''s organization'
);

select is(
  (select count(*)::int from public.space_members sm
   join public.spaces s on s.id = sm.space_id
   where sm.user_id = 'b0000000-0000-4000-8000-000000000002'
     and s.org_id in (select org_id from public.org_members
                      where user_id = 'a0000000-0000-4000-8000-000000000001')),
  0, 'a second signup does not join any of the first user''s spaces'
);

select is(
  (select count(*)::int from public.space_members
   where user_id = 'b0000000-0000-4000-8000-000000000002'),
  2, 'the second signup gets its own personal and org space and nothing else'
);

select * from finish();

rollback;
