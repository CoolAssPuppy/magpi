import { assertEquals } from '@std/assert';

import { apiErrorFrom } from './testing/assertions.ts';
import {
  ApiError,
  bearerToken,
  errorResponse,
  jsonResponse,
  rateLimited,
  toErrorResponse,
} from './errors.ts';

Deno.test('an api error becomes the error envelope with its status', async () => {
  const response = errorResponse(
    new ApiError(404, 'unknown_provider', 'that provider is not available'),
  );
  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    error: 'unknown_provider',
    message: 'that provider is not available',
  });
});

Deno.test('anything that is not an api error becomes a generic 500', async () => {
  const response = toErrorResponse(new TypeError('undefined is not a function'));
  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, 'internal');
  assertEquals(body.message, 'internal server error');
});

Deno.test('retry_after rides at the top level and in the header', async () => {
  const response = errorResponse(rateLimited(12.2));
  assertEquals(response.status, 429);
  assertEquals(response.headers.get('Retry-After'), '13');
  assertEquals((await response.json()).retry_after, 13);
});

Deno.test('a json response defaults to 200 and json content type', async () => {
  const response = jsonResponse({ connected: true });
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('content-type'), 'application/json');
  assertEquals(await response.json(), { connected: true });
});

Deno.test('a bearer token is pulled out of the authorization header', () => {
  assertEquals(bearerToken('Bearer abc.def', 'missing token'), 'abc.def');
  assertEquals(bearerToken('bearer   abc.def', 'missing token'), 'abc.def');
});

Deno.test('a missing or malformed authorization header is a 401', () => {
  for (const header of [null, '', 'Basic abc', 'Bearer']) {
    assertEquals(apiErrorFrom(() => bearerToken(header, 'missing bearer token')).status, 401);
  }
});
