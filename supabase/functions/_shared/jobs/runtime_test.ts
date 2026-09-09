import { assertEquals } from '@std/assert';

import { apiErrorFrom, envSource } from '../testing/assertions.ts';
import { requireWorkerCaller } from './runtime.ts';

const ENV = envSource({
  SUPABASE_URL: 'https://project.supabase.co',
  SB_SERVICE_ROLE_KEY: 'service-role-key',
});

function headers(authorization?: string): Headers {
  return new Headers(authorization ? { authorization } : {});
}

Deno.test('the scheduler holding the service role key may start a worker', () => {
  requireWorkerCaller(headers('Bearer service-role-key'), ENV);
});

Deno.test('a signed-in user cannot start a worker', () => {
  // A worker is machinery. Anyone reaching it directly is either confused or
  // trying to make the platform do unpaid work.
  const err = apiErrorFrom(() => requireWorkerCaller(headers('Bearer a.user.jwt'), ENV));
  assertEquals(err.status, 403);
  assertEquals(err.code, 'forbidden');
});

Deno.test('a missing credential is a 401, not a 403', () => {
  assertEquals(apiErrorFrom(() => requireWorkerCaller(headers(), ENV)).status, 401);
});

Deno.test('a near miss on the key is still refused', () => {
  assertEquals(
    apiErrorFrom(() => requireWorkerCaller(headers('Bearer service-role-ke'), ENV)).status,
    403,
  );
  assertEquals(
    apiErrorFrom(() => requireWorkerCaller(headers('Bearer service-role-keyy'), ENV)).status,
    403,
  );
});
