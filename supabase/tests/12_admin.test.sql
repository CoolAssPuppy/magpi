-- Metering and model telemetry are admin-only, with the role check running in the policy.

begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('a0000000-0000-4000-8000-000000000001', 'alice@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d0000000-0000-4000-8000-000000000004', 'dana@magpi.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- Alice owns her org, Bob is an admin in it and Carol a plain member of it. Dana keeps the
-- organization the signup trigger gave her, which is the one everything here has to stay out of.
-- Joining an organization means leaving your own: org_members_user_id_idx is unique on the
-- user, so the membership the signup trigger made is moved rather than added to.
update public.org_members
set org_id = (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner'),
    role = 'admin'
where user_id = 'b0000000-0000-4000-8000-000000000002';

update public.org_members
set org_id = (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner'),
    role = 'member'
where user_id = 'c0000000-0000-4000-8000-000000000003';

-- Moving an organization leaves the org space of the old one behind, so enrol them in the new one
-- the way the signup trigger would have.
insert into public.space_members (space_id, user_id)
select s.id, m.user_id
from public.org_members m
join public.spaces s on s.org_id = m.org_id and s.kind = 'org'
on conflict (space_id, user_id) do nothing;

delete from public.space_members sm
using public.spaces s
where sm.space_id = s.id
  and s.kind = 'org'
  and not exists (
    select 1 from public.org_members m
    where m.user_id = sm.user_id and m.org_id = s.org_id
  );

select set_config(
  'recall.org_a',
  (select org_id::text from public.org_members
   where user_id = 'a0000000-0000-4000-8000-000000000001' and role = 'owner'),
  true
);

select set_config(
  'recall.org_b',
  (select org_id::text from public.org_members
   where user_id = 'd0000000-0000-4000-8000-000000000004' and role = 'owner'),
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

-- Metering decides what an org is billed, so no client may write it.
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

reset role;

insert into public.org_invites (id, org_id, email, role, token_hash, invited_by,
                                expires_at, created_at)
values
  ('5e000000-0000-4000-8000-00000000000a', current_setting('recall.org_a')::uuid,
   'newmember@magpi.test', 'member', 'hash-a1',
   'a0000000-0000-4000-8000-000000000001', '2099-01-01 00:00:00+00', '2026-02-01 00:00:00+00'),
  ('5e000000-0000-4000-8000-00000000001a', current_setting('recall.org_a')::uuid,
   'newadmin@magpi.test', 'admin', 'hash-a2',
   'a0000000-0000-4000-8000-000000000001', '2099-01-01 00:00:00+00', '2026-02-01 00:00:00+00'),
  ('5e000000-0000-4000-8000-00000000000b', current_setting('recall.org_b')::uuid,
   'elsewhere@magpi.test', 'member', 'hash-b1',
   'd0000000-0000-4000-8000-000000000004', '2099-01-01 00:00:00+00', '2026-02-01 00:00:00+00');

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

-- Bob is an admin of org A and belongs to nothing else, so org B's invite is not his to read.
select is(
  (select count(*)::int from public.org_invites
   where org_id = current_setting('recall.org_b')::uuid),
  0, 'an admin sees no invite belonging to another organization'
);

set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

-- Reading this row means holding the hash of a token that admits a stranger.
select is(
  (select count(*)::int from public.org_invites
   where org_id = current_setting('recall.org_a')::uuid),
  0, 'a plain member of the org reads none of them'
);

select throws_ok(
  $$ insert into public.org_invites (org_id, email, role, token_hash, invited_by, expires_at)
     values (current_setting('recall.org_a')::uuid, 'stranger@magpi.test', 'owner',
             'hash-forged', 'c0000000-0000-4000-8000-000000000003',
             '2099-01-01 00:00:00+00') $$,
  '42501', null, 'and cannot invite anyone, least of all as an owner'
);

-- The audit trail is only worth having if it cannot be written to name somebody else.
set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ insert into public.org_invites (org_id, email, role, token_hash, invited_by, expires_at)
     values (current_setting('recall.org_a')::uuid, 'attributed@magpi.test', 'member',
             'hash-attributed', 'a0000000-0000-4000-8000-000000000001',
             '2099-01-01 00:00:00+00') $$,
  '42501', null, 'an admin cannot issue an invite in another admin''s name'
);

select lives_ok(
  $$ insert into public.org_invites (org_id, email, role, token_hash, invited_by, expires_at)
     values (current_setting('recall.org_a')::uuid, 'genuine@magpi.test', 'member',
             'hash-genuine', 'b0000000-0000-4000-8000-000000000002',
             '2099-01-01 00:00:00+00') $$,
  'an admin may issue one in their own name'
);

select is(
  (select count(*)::int from public.org_invites
   where org_id = current_setting('recall.org_a')::uuid),
  3, 'and it is there afterwards'
);

-- No update policy and no update grant, so a pending invite is immutable to every client.
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

-- org_member_emails is security definer, so its is_org_admin test is the only gate on addresses.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from public.org_member_emails(current_setting('recall.org_a')::uuid)),
  3::bigint, 'an owner reads an address for every member of their organization'
);

select ok(
  (select email from public.org_member_emails(current_setting('recall.org_a')::uuid)
   where user_id = 'c0000000-0000-4000-8000-000000000003') = 'carol@magpi.test',
  'and it is the address on the account, not a placeholder'
);



set local request.jwt.claims to '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from public.org_member_emails(current_setting('recall.org_a')::uuid)),
  3::bigint, 'an admin reads them too, because the members page is an admin page'
);

set local request.jwt.claims to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (select count(*) from public.org_member_emails(current_setting('recall.org_a')::uuid)),
  0::bigint, 'a plain member of the same organization reads nothing'
);

reset role;

select * from finish();

rollback;
