import { assert, assertEquals, assertThrows } from '@std/assert';

import { compose, isSigned, payloadSchema } from './hook.ts';

const SECRET_BYTES = new Uint8Array(32).fill(7);
const SECRET = `v1,whsec_${btoa(String.fromCharCode(...SECRET_BYTES))}`;
const SITE = 'https://magpi.test';

function payload(overrides: Record<string, unknown> = {}) {
  const { user = {}, email_data = {} } = overrides as {
    user?: Record<string, unknown>;
    email_data?: Record<string, unknown>;
  };
  return payloadSchema.parse({
    user: { email: 'reader@example.com', ...user },
    email_data: {
      token: '123456',
      token_hash: 'hash-current',
      redirect_to: '',
      email_action_type: 'recovery',
      ...email_data,
    },
  });
}

/** The signature the auth server would send for this body. */
async function sign(id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    SECRET_BYTES,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signed)));
}

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

Deno.test('every account email goes to the address it is about', () => {
  Deno.env.set('SB_WEB_BASE_URL', SITE);

  const cases = [
    ['signup', 'Confirm your email address'],
    ['recovery', 'Reset your Magpi password'],
    ['magiclink', 'Your Magpi sign-in link'],
    ['reauthentication', 'Your Magpi confirmation code'],
  ] as const;

  for (const [action, subject] of cases) {
    const { to, rendered } = compose(payload({ email_data: { email_action_type: action } }));
    assertEquals(to, 'reader@example.com', action);
    assertEquals(rendered.subject, subject);
  }
});

Deno.test('the link points at the confirm route with the type that made it', () => {
  Deno.env.set('SB_WEB_BASE_URL', SITE);

  const { rendered } = compose(payload({ email_data: { redirect_to: '/chat' } }));
  const html = JSON.stringify(rendered.body);

  assert(html.includes(`${SITE}/auth/confirm`), 'the link did not point at the confirm route');
  assert(html.includes('token_hash=hash-current'));
  assert(html.includes('type=recovery'));
  assert(html.includes('next=%2Fchat'));
});

// Both inboxes are asked and each gets a different token. Sending the current address the new
// address's token would let one click finish a change that is supposed to need two.
Deno.test('the new address is asked with its own token, not the old one', () => {
  Deno.env.set('SB_WEB_BASE_URL', SITE);

  const changing = payload({
    user: { new_email: 'new@example.com' },
    email_data: { email_action_type: 'email_change', token_hash_new: 'hash-new' },
  });

  const { to, rendered } = compose(changing);
  assertEquals(to, 'new@example.com');
  assert(JSON.stringify(rendered.body).includes('token_hash=hash-new'));
});

Deno.test('the current address is asked with its own token', () => {
  Deno.env.set('SB_WEB_BASE_URL', SITE);

  const changing = payload({
    user: { new_email: 'new@example.com' },
    email_data: { email_action_type: 'email_change_current', token_hash_new: 'hash-new' },
  });

  const { to, rendered } = compose(changing);
  assertEquals(to, 'reader@example.com');
  assert(JSON.stringify(rendered.body).includes('token_hash=hash-current'));
});

Deno.test('an action nobody wrote a template for is an error, not a blank email', () => {
  assertThrows(
    () => compose(payload({ email_data: { email_action_type: 'invite' } })),
    Error,
    'no template for invite',
  );
});

Deno.test('a correctly signed call is accepted', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  const body = '{"hello":"world"}';
  const signature = await sign('msg_1', '1757620000', body);

  assertEquals(
    await isSigned(
      headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1757620000',
        'webhook-signature': `v1,${signature}`,
      }),
      body,
    ),
    true,
  );
});

Deno.test('a body that was tampered with after signing is refused', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  const signature = await sign('msg_1', '1757620000', '{"hello":"world"}');

  assertEquals(
    await isSigned(
      headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1757620000',
        'webhook-signature': `v1,${signature}`,
      }),
      '{"hello":"elsewhere"}',
    ),
    false,
  );
});

Deno.test('a call carrying no signature at all is refused', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  assertEquals(await isSigned(headers({}), '{}'), false);
});

// A rotation offers the old and the new signature at once, space separated.
Deno.test('one matching signature among several is enough', async () => {
  Deno.env.set('SB_AUTH_HOOK_SECRET', SECRET);
  const body = '{"hello":"world"}';
  const signature = await sign('msg_1', '1757620000', body);

  assertEquals(
    await isSigned(
      headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1757620000',
        'webhook-signature': `v1,AAAA v1,${signature}`,
      }),
      body,
    ),
    true,
  );
});

// Failing open here would turn the hook into an open relay for password reset links.
Deno.test('no configured secret refuses everything rather than trusting it', async () => {
  Deno.env.delete('SB_AUTH_HOOK_SECRET');
  const signature = await sign('msg_1', '1757620000', '{}');

  assertEquals(
    await isSigned(
      headers({
        'webhook-id': 'msg_1',
        'webhook-timestamp': '1757620000',
        'webhook-signature': `v1,${signature}`,
      }),
      '{}',
    ),
    false,
  );
});
