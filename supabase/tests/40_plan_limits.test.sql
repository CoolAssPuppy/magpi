-- Plan limits live in the database, not in the client. A limit enforced only in
-- the upload page is a limit that an edge function, the MCP server, or a retry
-- loop walks straight past.

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select is(public.plan_document_limit('free'), 200,
  'the free plan holds 200 documents');
select is(public.plan_document_limit('team'), 25000,
  'the team plan holds 25000 documents');
select is(public.plan_document_limit('enterprise'), 1000000,
  'the enterprise plan holds 1000000 documents');

select is(public.plan_monthly_query_limit('free'), 500,
  'the free plan allows 500 queries a month');
select is(public.plan_monthly_query_limit('team'), 50000,
  'the team plan allows 50000 queries a month');
select is(public.plan_monthly_query_limit('enterprise'), 5000000,
  'the enterprise plan allows 5000000 queries a month');

insert into auth.users (id, email, instance_id, aud, role)
values ('a0000000-0000-4000-8000-000000000001', 'alice@magpi.test',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.spaces (id, org_id, kind, name)
values ('50000000-0000-4000-8000-00000000000a',
        (select org_id from public.org_members where user_id = 'a0000000-0000-4000-8000-000000000001'),
        'team', 'Alice team');

insert into public.space_members (space_id, user_id, created_at)
values ('50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001',
        '2026-01-02 00:00:00+00');

select set_config(
  'recall.org_a',
  (select org_id::text from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
  true
);

-- One short of the free limit.
insert into public.documents (org_id, space_id, title, origin, created_at, updated_at)
select current_setting('recall.org_a')::uuid, '50000000-0000-4000-8000-00000000000a',
       'Document ' || n, 'upload', '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'
from generate_series(1, 199) as n;

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select ok(
  (select allowed from public.check_ingest_allowed(current_setting('recall.org_a')::uuid)),
  'an org below its plan limit may ingest'
);

select is(
  (select used from public.check_ingest_allowed(current_setting('recall.org_a')::uuid)),
  199::bigint, 'and is told how many documents it already holds'
);

select is(
  (select plan_limit from public.check_ingest_allowed(current_setting('recall.org_a')::uuid)),
  200, 'and what the ceiling is'
);

reset role;

insert into public.documents (org_id, space_id, title, origin, created_at, updated_at)
values (current_setting('recall.org_a')::uuid, '50000000-0000-4000-8000-00000000000a',
        'Document 200', 'upload', '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select ok(
  not (select allowed from public.check_ingest_allowed(current_setting('recall.org_a')::uuid)),
  'an org at its plan limit is refused'
);

select matches(
  (select reason from public.check_ingest_allowed(current_setting('recall.org_a')::uuid)),
  'free', 'and the refusal names the plan it hit'
);

reset role;

update public.organizations set plan = 'team'
where id = current_setting('recall.org_a')::uuid;

select ok(
  (select allowed from public.check_ingest_allowed(current_setting('recall.org_a')::uuid)),
  'the same 200 documents are fine once the org is on the team plan'
);

-- An org id that does not exist must not read as unlimited.
select is(
  (select reason from public.check_ingest_allowed('00000000-0000-4000-8000-000000000000')),
  'organization not found', 'an unknown org is refused rather than waved through'
);

select * from finish();

rollback;
