import { assertEquals } from '@std/assert';

import { handleStripeEvent, type SignatureResult, verifyStripeSignature } from './billing.ts';
import { fixedClock } from './deps.ts';
import { requestsFor, type StubDb, stubDb } from './testing/stub_db.ts';
import { asyncApiErrorFrom } from './testing/assertions.ts';

const SECRET = 'whsec_test_secret';
const SIGNED_AT = 1757419200;
const AT_SIGNING = new Date(SIGNED_AT * 1000);
const ORG = '44444444-4444-4444-8444-444444444444';

/**
 * The signing side, written out separately from the verifying side.
 *
 * A helper that called into billing.ts would prove only that the module agrees
 * with itself.
 */
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signedHeader(
  payload: string,
  options: { secret?: string; timestamp?: number } = {},
): Promise<string> {
  const timestamp = options.timestamp ?? SIGNED_AT;
  const v1 = await hmacHex(options.secret ?? SECRET, `${timestamp}.${payload}`);
  return `t=${timestamp},v1=${v1}`;
}

/** Verification always uses SECRET; what varies is how the header was made. */
function verify(
  payload: string,
  header: string | null,
  now: Date = AT_SIGNING,
): Promise<SignatureResult> {
  return verifyStripeSignature({ payload, header, secret: SECRET, now });
}

function checkoutEvent(orgId: string = ORG): unknown {
  const metadata = { org_id: orgId };
  const object = { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1', metadata };
  return { id: 'evt_checkout_1', type: 'checkout.session.completed', data: { object } };
}

function subscriptionEvent(
  type: 'customer.subscription.updated' | 'customer.subscription.deleted',
  overrides: { status?: string; quantity?: number } = {},
): unknown {
  const items = { data: [{ id: 'si_1', quantity: overrides.quantity ?? 7 }] };
  const status = overrides.status ?? 'active';
  const object = { id: 'sub_1', status, customer: 'cus_1', items };
  return { id: `evt_${type}`, type, data: { object } };
}

/** Every organizations read and write finds the one org; stripe_events accepts. */
function orgFound(): StubDb {
  return stubDb((request) => (request.table === 'organizations' ? { body: [{ id: ORG }] } : {}));
}

function deps(stub: StubDb) {
  return { db: stub.db, clock: fixedClock(AT_SIGNING) };
}

Deno.test('a correctly signed payload verifies', async () => {
  const payload = '{"id":"evt_1"}';
  assertEquals(await verify(payload, await signedHeader(payload)), { ok: true });
});

Deno.test('a payload changed after signing does not verify', async () => {
  const header = await signedHeader('{"amount":100}');
  assertEquals(await verify('{"amount":900}', header), {
    ok: false,
    reason: 'no_matching_signature',
  });
});

Deno.test('a signature made with another secret does not verify', async () => {
  const payload = '{"id":"evt_1"}';
  const header = await signedHeader(payload, { secret: 'whsec_someone_else' });
  assertEquals(await verify(payload, header), { ok: false, reason: 'no_matching_signature' });
});

Deno.test('a missing signature header does not verify', async () => {
  assertEquals(await verify('{}', null), { ok: false, reason: 'missing_signature_header' });
});

Deno.test('a malformed signature header does not verify', async () => {
  for (const header of ['garbage', 't=notanumber,v1=abcd', 'v1=abcd', `t=${SIGNED_AT}`]) {
    assertEquals(await verify('{}', header), {
      ok: false,
      reason: 'malformed_signature_header',
    });
  }
});

Deno.test('a timestamp outside the tolerance does not verify', async () => {
  // A captured request replayed an hour later carries a signature that is still
  // arithmetically correct, so the timestamp is the only thing refusing it.
  const payload = '{"id":"evt_1"}';
  const header = await signedHeader(payload);
  const late = new Date((SIGNED_AT + 3600) * 1000);

  assertEquals(await verify(payload, header, late), {
    ok: false,
    reason: 'timestamp_outside_tolerance',
  });
  assertEquals(await verify(payload, header, new Date((SIGNED_AT + 299) * 1000)), { ok: true });
});

Deno.test('a header carrying several v1 values verifies when any one matches', async () => {
  // What a secret roll looks like on the wire.
  const payload = '{"id":"evt_1"}';
  const mine = await hmacHex(SECRET, `${SIGNED_AT}.${payload}`);
  const header = `t=${SIGNED_AT},v1=${'0'.repeat(64)},v1=${mine}`;
  assertEquals(await verify(payload, header), { ok: true });
});

Deno.test('a completed checkout session puts the organization on the team plan', async () => {
  const stub = orgFound();
  try {
    const result = await handleStripeEvent(checkoutEvent(), deps(stub));
    assertEquals(result, { kind: 'applied', type: 'checkout.session.completed', orgId: ORG });

    const events = requestsFor(stub, 'stripe_events');
    assertEquals(events[0].method, 'POST');
    assertEquals(events[0].body, {
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      processed_at: AT_SIGNING.toISOString(),
    });

    const orgs = requestsFor(stub, 'organizations');
    assertEquals(orgs.length, 1);
    assertEquals(orgs[0].method, 'PATCH');
    assertEquals(orgs[0].query, `id=eq.${ORG}&select=id`);
    assertEquals(orgs[0].body, {
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      plan: 'team',
    });
  } finally {
    await stub.close();
  }
});

Deno.test('a subscription update writes the seat count and keeps a paying org on team', async () => {
  const stub = orgFound();
  try {
    const event = subscriptionEvent('customer.subscription.updated', { quantity: 7 });
    const result = await handleStripeEvent(event, deps(stub));
    assertEquals(result, { kind: 'applied', type: 'customer.subscription.updated', orgId: ORG });

    const orgs = requestsFor(stub, 'organizations');
    assertEquals(orgs[0].method, 'GET');
    assertEquals(orgs[0].query, 'select=id&stripe_subscription_id=eq.sub_1');
    assertEquals(orgs[1].method, 'PATCH');
    assertEquals(orgs[1].query, `id=eq.${ORG}&select=id`);
    assertEquals(orgs[1].body, { seats: 7, plan: 'team' });
  } finally {
    await stub.close();
  }
});

Deno.test('a subscription in arrears keeps the team plan and an unpaid one loses it', async () => {
  for (const [status, plan] of [['past_due', 'team'], ['unpaid', 'free']]) {
    const stub = orgFound();
    try {
      await handleStripeEvent(
        subscriptionEvent('customer.subscription.updated', { status }),
        deps(stub),
      );
      assertEquals(requestsFor(stub, 'organizations')[1].body, { seats: 7, plan });
    } finally {
      await stub.close();
    }
  }
});

Deno.test('a subscription found only by customer id is still updated', async () => {
  // The subscription id is not on the row yet when checkout has not landed.
  const stub = stubDb((request) => {
    if (request.table !== 'organizations') return {};
    if (request.query.includes('stripe_subscription_id=eq.')) return { body: [] };
    return { body: [{ id: ORG }] };
  });
  try {
    const event = subscriptionEvent('customer.subscription.updated');
    const result = await handleStripeEvent(event, deps(stub));
    assertEquals(result.kind, 'applied');

    const orgs = requestsFor(stub, 'organizations');
    assertEquals(orgs[1].query, 'select=id&stripe_customer_id=eq.cus_1');
    assertEquals(orgs[2].method, 'PATCH');
  } finally {
    await stub.close();
  }
});

Deno.test('a deleted subscription drops the organization to one free seat', async () => {
  const stub = orgFound();
  try {
    const event = subscriptionEvent('customer.subscription.deleted', { status: 'canceled' });
    const result = await handleStripeEvent(event, deps(stub));
    assertEquals(result, { kind: 'applied', type: 'customer.subscription.deleted', orgId: ORG });

    const orgs = requestsFor(stub, 'organizations');
    assertEquals(orgs[1].body, { plan: 'free', seats: 1, stripe_subscription_id: null });
  } finally {
    await stub.close();
  }
});

Deno.test('an event type nobody handles is recorded and touches no organization', async () => {
  const stub = orgFound();
  try {
    const event = { id: 'evt_other', type: 'invoice.paid', data: { object: { id: 'in_1' } } };
    const result = await handleStripeEvent(event, deps(stub));
    assertEquals(result, { kind: 'ignored', type: 'invoice.paid', reason: 'unhandled_type' });
    assertEquals(requestsFor(stub, 'stripe_events').length, 1);
    assertEquals(requestsFor(stub, 'organizations'), []);
  } finally {
    await stub.close();
  }
});

Deno.test('an event id already recorded stops before any organization write', async () => {
  const stub = stubDb((request) =>
    request.table === 'stripe_events'
      ? { status: 409, body: { code: '23505', message: 'duplicate key value' } }
      : { body: [{ id: ORG }] }
  );
  try {
    const result = await handleStripeEvent(checkoutEvent(), deps(stub));
    assertEquals(result, { kind: 'duplicate', id: 'evt_checkout_1' });
    assertEquals(requestsFor(stub, 'organizations'), []);
  } finally {
    await stub.close();
  }
});

Deno.test('an event naming an organization nobody has is ignored rather than raised', async () => {
  // Raising would make Stripe redeliver an event that can never apply.
  for (const event of [checkoutEvent(), subscriptionEvent('customer.subscription.updated')]) {
    const stub = stubDb(() => ({ body: [] }));
    try {
      const result = await handleStripeEvent(event, deps(stub));
      if (result.kind !== 'ignored') throw new Error(`expected ignored, got ${result.kind}`);
      assertEquals(result.reason, 'organization_not_found');
    } finally {
      await stub.close();
    }
  }
});

Deno.test('a failed organization write releases the event id so Stripe can retry', async () => {
  const stub = stubDb((request) =>
    request.table === 'organizations' && request.method === 'PATCH'
      ? { status: 500, body: { code: 'XX000', message: 'boom' } }
      : {}
  );
  try {
    const err = await asyncApiErrorFrom(() => handleStripeEvent(checkoutEvent(), deps(stub)));
    assertEquals(err.status, 500);

    const events = requestsFor(stub, 'stripe_events');
    assertEquals(events[1].method, 'DELETE');
    assertEquals(events[1].query, 'id=eq.evt_checkout_1');
  } finally {
    await stub.close();
  }
});

Deno.test('an event that is not shaped like a stripe event is a 400', async () => {
  const stub = orgFound();
  try {
    const err = await asyncApiErrorFrom(() => handleStripeEvent({ nope: true }, deps(stub)));
    assertEquals(err.status, 400);
    assertEquals(requestsFor(stub, 'stripe_events'), []);
  } finally {
    await stub.close();
  }
});
