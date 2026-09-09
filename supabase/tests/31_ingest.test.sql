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

select plan(3);

insert into auth.users (id, email, instance_id, aud, role)
values ('a0000000-0000-4000-8000-000000000001', 'alice@recall.test',
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

-- Both of these want a check constraint that does not exist yet:
--
--   alter table public.ingest_jobs
--     add constraint ingest_jobs_terminal_has_error
--     check (status not in ('failed', 'timeout') or error is not null);
--
-- Without it a job can end in a terminal state with nothing to show the user,
-- and the page has no honest option left except a spinner.
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

select * from finish();

rollback;
