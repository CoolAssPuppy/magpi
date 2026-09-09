-- The shape of a finished ingest job.
--
-- A job that ended badly is the only thing standing between a user and a
-- spinner that never resolves, so the row has to carry enough to render a real
-- message: which stage it died in, and what went wrong.
--
-- Note on what is deliberately not asserted here. `stage` is declared not null
-- with a default of 'fetch', so "a timeout row has a non-null stage" cannot
-- fail and asserting it would be theatre. The column that can be null, and is
-- the one the UI actually needs, is `error`.

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

-- The stage is what turns "it failed" into "it failed while embedding". Moving
-- the status must not disturb it, and the updated_at trigger fires on the same
-- statement.
select is(
  (select stage::text from public.ingest_jobs
   where id = '58000000-0000-4000-8000-00000000000a'),
  'embed', 'a job that timed out still reports the stage it died in'
);

-- Both of these rest on ingest_jobs_terminal_has_error. Without it a job can end
-- in a terminal state with nothing to show the user, and the page has no honest
-- option left except a spinner.
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

-- The claim that never came back ------------------------------------------------
--
-- A job left at 'running' by a worker that died is invisible to both halves of
-- claim_ingest_jobs, which filter on 'queued'. Without the reclaim nothing in the
-- system would touch it again, and claimed_at would be a column written by every
-- claim and read by nothing.
--
-- One fixture here is relative to the clock rather than fixed, and deliberately.
-- The predicate under test compares claimed_at against now(), so a fresh claim
-- has to be expressed in the same terms or there is nothing to compare. The
-- stale one stays a fixed date, since 2020 is older than any window anyone would
-- pick.
--
-- The fresh one is a minute old rather than exactly now(). now() is the
-- transaction timestamp and does not move inside a test, so `claimed_at = now()`
-- fails `claimed_at < now()` for every interval including zero, and the
-- assertion below would have passed no matter how wide the window was opened. A
-- minute is comfortably inside fifteen and comfortably outside nothing.

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

-- All three statements in the function see one snapshot, so the reclaim shows up
-- on the next invocation rather than this one.
select public.claim_ingest_jobs(10);

select is(
  (select status::text from public.ingest_jobs
   where id = '58000000-0000-4000-8000-00000000001a'),
  'queued', 'a claim whose worker never came back is returned to the queue'
);

-- The attempt was counted when the job was claimed. Counting it again would
-- charge a crashed worker for a failure that never happened, and retire a
-- healthy document after two real ones.
select is(
  (select attempts from public.ingest_jobs
   where id = '58000000-0000-4000-8000-00000000001a'),
  1, 'and the reclaim itself counts no attempt'
);

-- Without this one an interval of zero would satisfy everything above, and a
-- healthy worker would have its job taken away mid-run and processed twice.
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
