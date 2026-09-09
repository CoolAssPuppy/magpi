-- Metering and model telemetry are admin-only. The point of these assertions is
-- that the role check runs in the policy: the same query, by the same person, in
-- the same session, changes its answer the moment their org role changes.

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@recall.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- Alice owns her org. Bob is an admin in it and an owner of his own. Carol is a
-- plain member.
insert into public.org_members (org_id, user_id, role)
select org_id, 'b0000000-0000-4000-8000-000000000002', 'admin'
from public.org_members
where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner';

insert into public.org_members (org_id, user_id, role)
select org_id, 'c0000000-0000-4000-8000-000000000003', 'member'
from public.org_members
where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner';

select set_config(
  'recall.org_a',
  (select org_id::text from public.org_members
   where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner'),
  true
);

select set_config(
  'recall.org_b',
  (select org_id::text from public.org_members
   where user_id = 'b0000000-0000-4000-8000-000000000002' and role = 'owner'),
  true
);

insert into public.usage_events (id, org_id, kind, quantity, occurred_at)
values
  ('5b000000-0000-4000-8000-00000000000a', current_setting('recall.org_a')::uuid,
   'query', 1, '2026-02-01 09:00:00+00'),
  ('5b000000-0000-4000-8000-00000000001a', current_setting('recall.org_a')::uuid,
   'document_ingested', 4, '2026-02-01 09:05:00+00'),
  ('5b000000-0000-4000-8000-00000000000b', current_setting('recall.org_b')::uuid,
   'query', 7, '2026-02-01 09:10:00+00');

insert into public.model_calls (id, org_id, purpose, model, input_tokens, output_tokens, latency_ms, occurred_at)
values
  ('5c000000-0000-4000-8000-00000000000a', current_setting('recall.org_a')::uuid,
   'chat', 'claude-opus-5', 900, 120, 640, '2026-02-01 09:00:01+00'),
  ('5c000000-0000-4000-8000-00000000001a', current_setting('recall.org_a')::uuid,
   'embedding', 'text-embedding-3-small', 400, 0, 90, '2026-02-01 09:05:01+00'),
  ('5c000000-0000-4000-8000-00000000000b', current_setting('recall.org_b')::uuid,
   'chat', 'claude-opus-5', 300, 40, 500, '2026-02-01 09:10:01+00');

-- Owner ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.usage_events
   where org_id = current_setting('recall.org_a')::uuid),
  2, 'an owner reads their org''s usage events'
);

select is(
  (select count(*)::int from public.model_calls
   where org_id = current_setting('recall.org_a')::uuid),
  2, 'an owner reads their org''s model calls'
);

-- Admin ---------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.usage_events
   where org_id = current_setting('recall.org_a')::uuid),
  2, 'an admin reads their org''s usage events'
);

select is(
  (select count(*)::int from public.model_calls
   where org_id = current_setting('recall.org_a')::uuid),
  2, 'an admin reads their org''s model calls'
);

-- Member --------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.usage_events
   where org_id = current_setting('recall.org_a')::uuid),
  0, 'a plain member of the same org reads no usage events'
);

select is(
  (select count(*)::int from public.model_calls
   where org_id = current_setting('recall.org_a')::uuid),
  0, 'a plain member of the same org reads no model calls'
);

-- Metering decides what an org is billed, so a client that could write it could
-- write itself a smaller invoice.
select throws_ok(
  $$ insert into public.usage_events (org_id, kind, quantity)
     values (current_setting('recall.org_a')::uuid, 'query', -1000) $$,
  '42501', null, 'a member cannot write usage events'
);

select throws_ok(
  $$ insert into public.model_calls (org_id, purpose, model)
     values (current_setting('recall.org_a')::uuid, 'chat', 'forged') $$,
  '42501', null, 'a member cannot write model calls'
);

-- Cross-org -----------------------------------------------------------------

set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.usage_events
   where org_id = current_setting('recall.org_b')::uuid),
  0, 'being an owner somewhere is not being an owner everywhere, for usage events'
);

select is(
  (select count(*)::int from public.model_calls
   where org_id = current_setting('recall.org_b')::uuid),
  0, 'and the same for model calls'
);

-- The role change is the only thing that moves ------------------------------
--
-- No sign-out, no new session, no page reload. If analytics were gated in the
-- UI these three assertions would all read the same.

reset role;

update public.org_members set role = 'admin'
where org_id = current_setting('recall.org_a')::uuid
  and user_id = 'c0000000-0000-4000-8000-000000000003';

set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.usage_events
   where org_id = current_setting('recall.org_a')::uuid),
  2, 'promoting that member to admin makes the same query return rows'
);

select is(
  (select count(*)::int from public.model_calls
   where org_id = current_setting('recall.org_a')::uuid),
  2, 'and the model calls with it'
);

reset role;

update public.org_members set role = 'member'
where org_id = current_setting('recall.org_a')::uuid
  and user_id = 'c0000000-0000-4000-8000-000000000003';

set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.usage_events
   where org_id = current_setting('recall.org_a')::uuid),
  0, 'demoting them takes it away again'
);

-- Invites --------------------------------------------------------------------
--
-- The same admin gate on a table that holds a credential. An invite carries the
-- hash of the token that lets a stranger into the organization, and the role
-- they arrive with, so who may read one and who may issue one are both part of
-- the permission model rather than page furniture.

reset role;

insert into public.org_invites (id, org_id, email, role, token_hash, invited_by,
                                expires_at, created_at)
values
  ('5e000000-0000-4000-8000-00000000000a', current_setting('recall.org_a')::uuid,
   'newmember@recall.test', 'member', 'hash-a1',
   'a0000000-0000-4000-8000-000000000001', '2099-01-01 00:00:00+00', '2026-02-01 00:00:00+00'),
  ('5e000000-0000-4000-8000-00000000001a', current_setting('recall.org_a')::uuid,
   'newadmin@recall.test', 'admin', 'hash-a2',
   'a0000000-0000-4000-8000-000000000001', '2099-01-01 00:00:00+00', '2026-02-01 00:00:00+00'),
  ('5e000000-0000-4000-8000-00000000000b', current_setting('recall.org_b')::uuid,
   'elsewhere@recall.test', 'member', 'hash-b1',
   'b0000000-0000-4000-8000-000000000002', '2099-01-01 00:00:00+00', '2026-02-01 00:00:00+00');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.org_invites
   where org_id = current_setting('recall.org_a')::uuid),
  2, 'an owner reads the invites pending on their org'
);

set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.org_invites
   where org_id = current_setting('recall.org_a')::uuid),
  2, 'and so does an admin'
);

select is(
  (select count(*)::int from public.org_invites
   where org_id = current_setting('recall.org_b')::uuid),
  1, 'each org sees its own'
);

set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

-- A member who could read this row would hold the hash of a token that admits a
-- stranger, and could see who is about to arrive as an admin.
select is(
  (select count(*)::int from public.org_invites
   where org_id = current_setting('recall.org_a')::uuid),
  0, 'a plain member of the org reads none of them'
);

select throws_ok(
  $$ insert into public.org_invites (org_id, email, role, token_hash, invited_by, expires_at)
     values (current_setting('recall.org_a')::uuid, 'stranger@recall.test', 'owner',
             'hash-forged', 'c0000000-0000-4000-8000-000000000003',
             '2099-01-01 00:00:00+00') $$,
  '42501', null, 'and cannot invite anyone, least of all as an owner'
);

-- The audit trail is only worth having if it cannot be written to say somebody
-- else did it.
set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ insert into public.org_invites (org_id, email, role, token_hash, invited_by, expires_at)
     values (current_setting('recall.org_a')::uuid, 'attributed@recall.test', 'member',
             'hash-attributed', 'a0000000-0000-4000-8000-000000000001',
             '2099-01-01 00:00:00+00') $$,
  '42501', null, 'an admin cannot issue an invite in another admin''s name'
);

select lives_ok(
  $$ insert into public.org_invites (org_id, email, role, token_hash, invited_by, expires_at)
     values (current_setting('recall.org_a')::uuid, 'genuine@recall.test', 'member',
             'hash-genuine', 'b0000000-0000-4000-8000-000000000002',
             '2099-01-01 00:00:00+00') $$,
  'an admin may issue one in their own name'
);

select is(
  (select count(*)::int from public.org_invites
   where org_id = current_setting('recall.org_a')::uuid),
  3, 'and it is there afterwards'
);

-- No update policy and no update grant, so a pending invite is immutable to
-- every client. An invite that could be edited after it was issued is an invite
-- whose role could be raised to owner between sending and accepting.
select throws_ok(
  $$ update public.org_invites set role = 'owner'
     where id = '5e000000-0000-4000-8000-00000000000a' $$,
  '42501', null, 'nobody can raise the role on an invite that has already been issued'
);

set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select lives_ok(
  $$ delete from public.org_invites
     where id = '5e000000-0000-4000-8000-00000000000a' $$,
  'a member deleting an invite reports success'
);

reset role;

select is(
  (select count(*)::int from public.org_invites
   where id = '5e000000-0000-4000-8000-00000000000a'),
  1, 'and cancels nothing, which is what that success meant'
);

select * from finish();

rollback;
