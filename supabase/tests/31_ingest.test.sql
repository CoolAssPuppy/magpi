-- The shape of a finished ingest job: the stage it died in, and the error to render.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

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

insert into public.documents (id, org_id, space_id, title, origin, created_at, updated_at)
values ('51000000-0000-4000-8000-00000000000a',
        (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
        '50000000-0000-4000-8000-00000000000a', 'A large PDF', 'upload',
        '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00');

insert into public.ingest_jobs (id, org_id, space_id, document_id, stage, status,
                                created_at, updated_at)
values ('58000000-0000-4000-8000-00000000000a',
        (select org_id from public.spaces where id = '50000000-0000-4000-8000-00000000000a'),
        '50000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a',
        'fetch', 'queued', '2026-01-05 00:00:00+00', '2026-01-05 00:00:00+00');

-- Ingest jobs are written by edge functions, so the writer here is service_role.
set local role service_role;

update public.ingest_jobs
set stage = 'embed', status = 'running', claimed_at = '2026-01-05 00:01:00+00'
where id = '58000000-0000-4000-8000-00000000000a';

update public.ingest_jobs
set status = 'timeout', error = 'embedding call exceeded the wall clock'
where id = '58000000-0000-4000-8000-00000000000a';

-- Moving the status must not disturb the stage, and the updated_at trigger fires as well.
select is(
  (select stage::text from public.ingest_jobs
   where id = '58000000-0000-4000-8000-00000000000a'),
  'embed', 'a job that timed out still reports the stage it died in'
);

-- Both of these rest on ingest_jobs_terminal_has_error.
select throws_ok(
  $$ insert into public.ingest_jobs (org_id, space_id, document_id, stage, status)
     select org_id, space_id, id, 'embed', 'timeout'
     from public.documents where id = '51000000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'a timed-out job cannot be written with no error message'
);

select throws_ok(
  $$ insert into public.ingest_jobs (org_id, space_id, document_id, stage, status)
     select org_id, space_id, id, 'chunk', 'failed'
     from public.documents where id = '51000000-0000-4000-8000-00000000000a' $$,
  '23514', null, 'and neither can a failed one'
);

-- Reclaiming a dead claim. The fresh fixture is a minute old, since now() does not move here.

insert into public.ingest_jobs (id, org_id, space_id, document_id, stage, status,
                                attempts, claimed_at, created_at, updated_at)
select '58000000-0000-4000-8000-00000000001a', org_id, space_id, id, 'embed', 'running',
       1, '2020-01-01 00:00:00+00', '2026-01-05 00:00:00+00', '2026-01-05 00:00:00+00'
from public.documents where id = '51000000-0000-4000-8000-00000000000a';

insert into public.ingest_jobs (id, org_id, space_id, document_id, stage, status,
                                attempts, claimed_at, created_at, updated_at)
select '58000000-0000-4000-8000-00000000002a', org_id, space_id, id, 'embed', 'running',
       1, now() - interval '1 minute', '2026-01-05 00:00:00+00', '2026-01-05 00:00:00+00'
from public.documents where id = '51000000-0000-4000-8000-00000000000a';

-- The statements see one snapshot, so the reclaim shows up on the next invocation.
select public.claim_ingest_jobs(10);

select is(
  (select status::text from public.ingest_jobs
   where id = '58000000-0000-4000-8000-00000000001a'),
  'queued', 'a claim whose worker never came back is returned to the queue'
);

-- The attempt was counted at claim time, so the reclaim must not count it again.
select is(
  (select attempts from public.ingest_jobs
   where id = '58000000-0000-4000-8000-00000000001a'),
  1, 'and the reclaim itself counts no attempt'
);

-- Without this an interval of zero would satisfy everything above.
select is(
  (select status::text from public.ingest_jobs
   where id = '58000000-0000-4000-8000-00000000002a'),
  'running', 'while a claim still inside the window is left alone'
);

select public.claim_ingest_jobs(10);

select is(
  (select status::text from public.ingest_jobs
   where id = '58000000-0000-4000-8000-00000000001a'),
  'running', 'the reclaimed job is picked up on the following call'
);

select is(
  (select attempts from public.ingest_jobs
   where id = '58000000-0000-4000-8000-00000000001a'),
  2, 'and that claim, unlike the reclaim, does count an attempt'
);

select * from finish();

rollback;
