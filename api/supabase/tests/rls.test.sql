-- RLS and privilege tests.
--
-- These assert the security properties, not the schema shape: that a user
-- cannot read another user's rows, that secrets are unreachable by any client
-- role, and that the deny-by-default tables really deny.

begin;
select plan(48);

create extension if not exists pgtap with schema extensions;

-- Two users to test isolation between.
insert into auth.users (id, email, instance_id, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- on_auth_user_created already inserted a profile for each. Asserting the
-- trigger fired is itself a test: without it a paired badge shows a blank
-- identity, which reads as a pairing failure to the person holding it.
select is(
  (select count(*)::int from public.profiles
   where id in ('11111111-1111-1111-1111-111111111111',
                '22222222-2222-2222-2222-222222222222')),
  2, 'a profile is created automatically for every new auth user'
);

insert into public.connections (user_id, provider, external_account, access_token_enc)
values
  ('11111111-1111-1111-1111-111111111111', 'google', 'alice', '\xdeadbeef'),
  ('22222222-2222-2222-2222-222222222222', 'google', 'bob', '\xcafebabe');

insert into public.badges (user_id, badge_uid, token_hash) values
  ('11111111-1111-1111-1111-111111111111', 'uid-alice', '\x01'),
  ('22222222-2222-2222-2222-222222222222', 'uid-bob', '\x02');

insert into public.page_configs (user_id, page_slug, enabled, position) values
  ('11111111-1111-1111-1111-111111111111', 'next_thing', true, 0),
  ('22222222-2222-2222-2222-222222222222', 'deploys', true, 0);

insert into public.pomodoro_settings (user_id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.device_codes (user_code, device_code_hash, expires_at)
values ('WXYZ-2345', '\x03', now() + interval '10 minutes');

insert into public.provider_cache (user_id, provider, cache_key, payload, expires_at)
values ('11111111-1111-1111-1111-111111111111', 'google', 'calendar',
        '{"items": []}', now() + interval '1 minute');

-- Pairing-hijack backstop: uid-alice is already active for Alice, so a second
-- active badge for the same uid under another account must be refused.
select throws_ok(
  $$ insert into public.badges (user_id, badge_uid, token_hash)
     values ('22222222-2222-2222-2222-222222222222', 'uid-alice', '\x99') $$,
  '23505',
  null,
  'a uid already linked to one account cannot get a second active badge'
);

-- The registry ships six providers and every scope is read only.
select is((select count(*)::int from public.providers), 6,
  'six providers are seeded');
select ok(
  not exists (
    select 1 from public.providers, unnest(scopes) as scope
    where scope ilike '%write%' or scope ilike '%admin%'
  ),
  'no seeded provider asks for a write scope'
);
select ok(
  not exists (
    select 1 from public.providers
    where slug = 'google' and 'https://www.googleapis.com/auth/gmail.readonly' = any (scopes)
  ),
  'google asks for gmail.metadata, never gmail.readonly'
);

-- RLS is on and forced everywhere in public.
select ok(
  (select bool_and(rowsecurity) from pg_tables where schemaname = 'public'),
  'row level security is enabled on every public table'
);
select ok(
  (select bool_and(relforcerowsecurity) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'row level security is forced on every public table'
);

-- The publication holds exactly the three intended tables.
select set_eq(
  $$ select tablename::text from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' $$,
  array['badges', 'page_configs', 'connections'],
  'the realtime publication holds exactly badges, page_configs, and connections'
);
select ok(
  not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and attnames::text[] && array['token_hash', 'access_token_enc', 'refresh_token_enc']
  ),
  'no secret column is published to realtime'
);

-- Act as Alice.
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.profiles), 1,
  'a user sees only their own profile');
select is((select count(*)::int from public.badges), 1,
  'a user sees only their own badges');
select is((select badge_uid from public.badges), 'uid-alice',
  'and the one they see is theirs');
select is((select count(*)::int from public.connections), 1,
  'a user sees only their own connections');
select is((select count(*)::int from public.connections_public), 1,
  'the public projection is scoped the same way');
select is((select count(*)::int from public.page_configs), 1,
  'a user sees only their own page configs');
select is((select page_slug from public.page_configs), 'next_thing',
  'and the one they see is theirs');
select is((select count(*)::int from public.pomodoro_settings), 1,
  'a user sees only their own pomodoro settings');
select is((select count(*)::int from public.providers), 6,
  'a signed-in user reads the whole provider registry');

-- Secrets are absent from the grant, not merely filtered by a policy.
select throws_ok(
  'select token_hash from public.badges',
  '42501', null,
  'authenticated cannot select badges.token_hash'
);
select throws_ok(
  'select access_token_enc from public.connections',
  '42501', null,
  'authenticated cannot select connections.access_token_enc'
);
select throws_ok(
  'select refresh_token_enc from public.connections',
  '42501', null,
  'authenticated cannot select connections.refresh_token_enc'
);

-- Deny-by-default tables deny.
select throws_ok(
  'select * from public.device_codes',
  '42501', null,
  'authenticated cannot select from device_codes'
);
select throws_ok(
  'select * from public.oauth_states',
  '42501', null,
  'authenticated cannot select from oauth_states'
);
select throws_ok(
  'select * from public.provider_cache',
  '42501', null,
  'authenticated cannot select from provider_cache'
);
select throws_ok(
  'select * from public.rate_limits',
  '42501', null,
  'authenticated cannot select from rate_limits'
);
select throws_ok(
  'select * from public.pending_connections',
  '42501', null,
  'authenticated cannot select from pending_connections'
);

-- A user cannot write the columns that would mint a credential or move a row
-- to someone else.
select throws_ok(
  $$ update public.badges set token_hash = '\xff' $$,
  '42501', null,
  'authenticated cannot update badges.token_hash'
);
select throws_ok(
  $$ update public.badges set user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'authenticated cannot reassign a badge to another user'
);
select throws_ok(
  $$ insert into public.badges (user_id, badge_uid, token_hash)
     values ('11111111-1111-1111-1111-111111111111', 'uid-forged', '\xaa') $$,
  '42501', null,
  'authenticated cannot insert a badge'
);
select throws_ok(
  $$ insert into public.connections (user_id, provider) values
     ('11111111-1111-1111-1111-111111111111', 'vercel') $$,
  '42501', null,
  'authenticated cannot insert a connection'
);
select throws_ok(
  $$ update public.providers set enabled = false $$,
  '42501', null,
  'authenticated cannot write the provider registry'
);

-- Renaming and revoking a badge is allowed, because those are the two columns
-- the grant lists.
select lives_ok(
  $$ update public.badges set label = 'Desk badge' $$,
  'a user may rename their own badge'
);
select lives_ok(
  $$ update public.badges set revoked_at = now() $$,
  'a user may revoke their own badge'
);

-- Owning your own page configs and pomodoro settings.
select lives_ok(
  $$ update public.page_configs set enabled = false $$,
  'a user may turn their own page off'
);
select lives_ok(
  $$ update public.pomodoro_settings set work_min = 30 $$,
  'a user may change their own pomodoro length'
);
select throws_ok(
  $$ insert into public.page_configs (user_id, page_slug)
     values ('22222222-2222-2222-2222-222222222222', 'counters') $$,
  '42501', null,
  'a user cannot create a page config for someone else'
);

-- Constraints hold even for the owner.
select throws_ok(
  $$ update public.pomodoro_settings set work_min = 0 $$,
  '23514', null,
  'a pomodoro shorter than a minute is refused'
);

-- Act as anon.
reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok('select * from public.profiles', '42501', null,
  'anon reads nothing from profiles');
select throws_ok('select * from public.badges', '42501', null,
  'anon reads nothing from badges');
select throws_ok('select * from public.connections', '42501', null,
  'anon reads nothing from connections');
select throws_ok('select * from public.providers', '42501', null,
  'anon reads nothing from providers');
select throws_ok('select * from public.page_configs', '42501', null,
  'anon reads nothing from page_configs');
select throws_ok('select * from public.pomodoro_settings', '42501', null,
  'anon reads nothing from pomodoro_settings');
select throws_ok('select * from public.device_codes', '42501', null,
  'anon reads nothing from device_codes');
select throws_ok('select * from public.oauth_states', '42501', null,
  'anon reads nothing from oauth_states');
select throws_ok('select * from public.provider_cache', '42501', null,
  'anon reads nothing from provider_cache');
select throws_ok('select * from public.rate_limits', '42501', null,
  'anon reads nothing from rate_limits');
select throws_ok('select * from public.pending_connections', '42501', null,
  'anon reads nothing from pending_connections');

select * from finish();
rollback;
