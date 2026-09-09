import { assertEquals } from '@std/assert';

import { clientIp, corsHeadersFor, handleOptions, toCoreRequest } from './http.ts';
import { envSource } from './testing/assertions.ts';

// Every request on the deployed runtime carries x-forwarded-for, and its
// rightmost entry is the platform's own proxy, so reading it first gave every
// caller in the world the same value and turned each per-ip rate limit rule
// into one global one.
Deno.test('the client ip is the one the edge resolved, not a forwarded entry', () => {
  const headers = new Headers({
    'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3',
    'cf-connecting-ip': '4.4.4.4',
  });
  assertEquals(clientIp(headers), '4.4.4.4');
});

// A caller can send whatever they like in x-forwarded-for. cf-connecting-ip is
// written by the edge over anything the caller sent, so a header they control
// must not be able to displace it.
Deno.test('a spoofed cf-connecting-ip cannot be beaten by a forwarded entry', () => {
  const headers = new Headers({
    'cf-connecting-ip': '4.4.4.4',
    'x-forwarded-for': '4.4.4.4, 9.9.9.9',
  });
  assertEquals(clientIp(headers), '4.4.4.4');
});

Deno.test('the rightmost forwarded entry is the fallback, never the leftmost', () => {
  // The leftmost is client-supplied, so reading it lets a caller present a
  // fresh ip per request and never reach a limit.
  const headers = new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' });
  assertEquals(clientIp(headers), '3.3.3.3');
});

Deno.test('a request with no forwarding headers reads as unknown', () => {
  assertEquals(clientIp(new Headers()), 'unknown');
});

Deno.test('the path is what follows the function name', async () => {
  const core = await toCoreRequest(
    new Request('https://p.supabase.co/functions/v1/ingest-worker/run?limit=5', {
      method: 'POST',
      body: JSON.stringify({ batch: 3 }),
    }),
    'ingest-worker',
  );
  assertEquals(core.path, '/run');
  assertEquals(core.method, 'POST');
  assertEquals(core.query.get('limit'), '5');
  assertEquals(core.body, { batch: 3 });
});

Deno.test('a body that is not json reads as null rather than throwing', async () => {
  const core = await toCoreRequest(
    new Request('https://p.supabase.co/functions/v1/x', { method: 'POST', body: 'not json' }),
    'x',
  );
  assertEquals(core.body, null);
});

Deno.test('an allowed origin is echoed back and a disallowed one is not', () => {
  const source = envSource({ SB_WEB_ORIGINS: 'https://magpi.dev,https://staging.magpi.dev' });
  const allowed = corsHeadersFor(new Headers({ origin: 'https://magpi.dev' }), source);
  assertEquals(allowed['Access-Control-Allow-Origin'], 'https://magpi.dev');

  const refused = corsHeadersFor(new Headers({ origin: 'https://evil.example' }), source);
  assertEquals(refused['Access-Control-Allow-Origin'], undefined);
});

Deno.test('cors varies on origin so a cache cannot cross-serve a response', () => {
  const headers = corsHeadersFor(new Headers(), envSource({}));
  assertEquals(headers['Vary'], 'Origin');
});

Deno.test('preflight is answered with 204 and nothing else is', () => {
  const options = handleOptions(
    new Request('https://p.supabase.co/x', { method: 'OPTIONS' }),
    envSource({}),
  );
  assertEquals(options?.status, 204);
  assertEquals(handleOptions(new Request('https://p.supabase.co/x'), envSource({})), null);
});
