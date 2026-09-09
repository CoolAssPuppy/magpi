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

/** The price a Team subscription is sold at, as SB_STRIPE_PRICE_TEAM would set it. */
const TEAM_PRICE = 'price_team_test';

function subscriptionEvent(
  type: 'customer.subscription.updated' | 'customer.subscription.deleted',
  overrides: { status?: string; quantity?: number; priceId?: string } = {},
): unknown {
  const price = { id: overrides.priceId ?? TEAM_PRICE };
  const items = { data: [{ id: 'si_1', quantity: overrides.quantity ?? 7, price }] };
  const status = overrides.status ?? 'active';
  const object = { id: 'sub_1', status, customer: 'cus_1', items };
  return { id: `evt_${type}`, type, data: { object } };
}

/** A recorded event, envelope and all, as Stripe actually sends it. */
async function fixture(name: string): Promise<unknown> {
  const path = new URL(`./testing/fixtures/stripe/${name}.json`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(path));
}

/** The organization the recorded fixtures name in client_reference_id. */
const FIXTURE_ORG = '11111111-1111-4111-8111-111111111111';

/** The body of one captured write, as a record rather than as unknown. */
function bodyOf(stub: StubDb, table: string, index: number): Record<string, unknown> {
  const body = requestsFor(stub, table)[index].body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error(`${table}[${index}] was not an object body`);
  }
  return body as Record<string, unknown>;
}

function fixtureOrgFound(): StubDb {
  return stubDb((request) =>
    request.table === 'organizations' ? { body: [{ id: FIXTURE_ORG }] } : {}
  );
}

/** Every organizations read and write finds the one org; stripe_events accepts. */
function orgFound(): StubDb {
  return stubDb((request) => (request.table === 'organizations' ? { body: [{ id: ORG }] } : {}));
}

function deps(stub: StubDb, teamPriceId: string | null = TEAM_PRICE) {
  return { db: stub.db, clock: fixedClock(AT_SIGNING), teamPriceId };
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

// The tests below run against recorded Stripe events rather than objects built
// to the shape this module already expects. Every one of them failed before the
// fix it names, and none of the inline-built tests above could have caught any
// of them.

Deno.test('a paying subscription on a price we do not sell is not team', async () => {
  // The revenue bug. Any active subscription on any price used to file as team,
  // including one created by hand in the dashboard.
  const stub = fixtureOrgFound();
  try {
    const result = await handleStripeEvent(
      await fixture('subscription-updated-unknown-price'),
      deps(stub),
    );
    assertEquals(result.kind, 'applied');
    assertEquals(requestsFor(stub, 'organizations')[1].body, { seats: 7, plan: 'free' });
  } finally {
    await stub.close();
  }
});

Deno.test('a paying subscription on the team price is team', async () => {
  const stub = fixtureOrgFound();
  try {
    await handleStripeEvent(await fixture('subscription-updated'), deps(stub));
    assertEquals(requestsFor(stub, 'organizations')[1].body, { seats: 7, plan: 'team' });
  } finally {
    await stub.close();
  }
});

Deno.test('with no price configured, only the intended plan can confirm team', async () => {
  // A deployment that has not wired billing up cannot confirm anything, so a
  // subscription carrying no intent is free rather than assumed.
  const stub = fixtureOrgFound();
  try {
    await handleStripeEvent(await fixture('subscription-updated'), deps(stub, null));
    assertEquals(requestsFor(stub, 'organizations')[1].body, { seats: 7, plan: 'free' });
  } finally {
    await stub.close();
  }
});

Deno.test('the plan intended at checkout travels with the subscription', async () => {
  // metadata.plan is set by the checkout route, so an unknown price still
  // resolves for a subscription we created ourselves.
  const stub = fixtureOrgFound();
  try {
    await handleStripeEvent(await fixture('subscription-updated-expanded'), deps(stub, null));
    assertEquals(bodyOf(stub, 'organizations', 1).plan, 'team');
  } finally {
    await stub.close();
  }
});

Deno.test('a subscription that stopped paying loses the plan whatever its price', async () => {
  const stub = fixtureOrgFound();
  try {
    await handleStripeEvent(await fixture('subscription-updated-unpaid'), deps(stub));
    assertEquals(requestsFor(stub, 'organizations')[1].body, { seats: 7, plan: 'free' });
  } finally {
    await stub.close();
  }
});

Deno.test('an expanded customer object is read, not rejected', async () => {
  // Replaying an event from the dashboard, or configuring the endpoint with
  // expansion, sends the object where the id normally is. Rejecting it made the
  // event a permanent 400 and left the organization on the wrong plan.
  const stub = fixtureOrgFound();
  try {
    const result = await handleStripeEvent(
      await fixture('subscription-updated-expanded'),
      deps(stub),
    );
    assertEquals(result.kind, 'applied');
    assertEquals(
      requestsFor(stub, 'organizations')[0].query,
      'select=id&stripe_subscription_id=eq.sub_TestTeam01',
    );
  } finally {
    await stub.close();
  }
});

Deno.test('an item with no quantity counts as one seat', async () => {
  // Stripe omits quantity on a metered item.
  const stub = fixtureOrgFound();
  try {
    await handleStripeEvent(await fixture('subscription-updated-expanded'), deps(stub));
    assertEquals(bodyOf(stub, 'organizations', 1).seats, 1);
  } finally {
    await stub.close();
  }
});

Deno.test('a checkout session naming its organization only by reference still applies', async () => {
  const stub = fixtureOrgFound();
  try {
    const result = await handleStripeEvent(
      await fixture('checkout-session-reference-only'),
      deps(stub),
    );
    assertEquals(result, {
      kind: 'applied',
      type: 'checkout.session.completed',
      orgId: FIXTURE_ORG,
    });
    assertEquals(requestsFor(stub, 'organizations')[0].body, {
      stripe_customer_id: 'cus_TestTeam01',
      stripe_subscription_id: 'sub_TestTeam01',
      plan: 'team',
    });
  } finally {
    await stub.close();
  }
});

Deno.test('a recorded checkout session applies with its envelope intact', async () => {
  const stub = fixtureOrgFound();
  try {
    const result = await handleStripeEvent(await fixture('checkout-session-completed'), deps(stub));
    assertEquals(result.kind, 'applied');
    assertEquals(requestsFor(stub, 'stripe_events')[0].body, {
      id: 'evt_checkout_completed',
      type: 'checkout.session.completed',
      processed_at: AT_SIGNING.toISOString(),
    });
  } finally {
    await stub.close();
  }
});

Deno.test('a session naming no organization at all is terminal, not a retry', async () => {
  const stub = fixtureOrgFound();
  try {
    const result = await handleStripeEvent(
      { id: 'evt_x', type: 'checkout.session.completed', data: { object: { customer: 'cus_1' } } },
      deps(stub),
    );
    assertEquals(result, {
      kind: 'ignored',
      type: 'checkout.session.completed',
      reason: 'organization_not_identified',
    });
    assertEquals(requestsFor(stub, 'organizations'), []);
  } finally {
    await stub.close();
  }
});

Deno.test('a recorded deletion drops the organization to one free seat', async () => {
  const stub = fixtureOrgFound();
  try {
    await handleStripeEvent(await fixture('subscription-deleted'), deps(stub));
    assertEquals(requestsFor(stub, 'organizations')[1].body, {
      plan: 'free',
      seats: 1,
      stripe_subscription_id: null,
    });
  } finally {
    await stub.close();
  }
});
