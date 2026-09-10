// Stripe webhook verification and the three events that move an organization between plans.

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from './errors.ts';
import { timingSafeEqual, toHex } from './crypto.ts';
import { audit } from './db.ts';
import type { ClockDeps } from './deps.ts';
import { parseBody } from './validate.ts';

const TOLERANCE_SECONDS = 300;

export interface SignatureInput {
  /** The exact bytes that arrived. A reserialized body hashes differently. */
  payload: string;
  header: string | null;
  secret: string;
  /** Injected, so a test can pin the instant the timestamp is measured against. */
  now: Date;
  toleranceSeconds?: number;
}

export type SignatureResult = { ok: true } | { ok: false; reason: string };

/** `signatures` holds every v1: Stripe sends one per active secret during a roll. */
type ParsedSignatureHeader = { timestamp: number; signatures: string[] };

function parseSignatureHeader(header: string): ParsedSignatureHeader | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const at = part.indexOf('=');
    if (at < 1) return null;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === 't') {
      if (!/^\d+$/.test(value)) return null;
      timestamp = Number(value);
    } else if (key === 'v1' && value.length > 0) {
      signatures.push(value);
    }
  }
  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const spec = { name: 'HMAC', hash: 'SHA-256' };
  const raw = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey('raw', raw, spec, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toHex(new Uint8Array(mac));
}

/** Verifies Stripe's signature scheme. Returns a result rather than throwing. */
export async function verifyStripeSignature(input: SignatureInput): Promise<SignatureResult> {
  if (input.header === null || input.header.trim().length === 0) {
    return { ok: false, reason: 'missing_signature_header' };
  }

  const parsed = parseSignatureHeader(input.header);
  if (parsed === null) return { ok: false, reason: 'malformed_signature_header' };

  // Reject an old timestamp, so a request captured off the wire does not stay valid forever.
  const tolerance = input.toleranceSeconds ?? TOLERANCE_SECONDS;
  if (Math.abs(input.now.getTime() / 1000 - parsed.timestamp) > tolerance) {
    return { ok: false, reason: 'timestamp_outside_tolerance' };
  }

  const expected = await hmacSha256Hex(input.secret, `${parsed.timestamp}.${input.payload}`);
  // Every candidate is compared even after a match, so timing does not say which one matched.
  let matched = false;
  for (const candidate of parsed.signatures) {
    if (timingSafeEqual(candidate, expected)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: 'no_matching_signature' };
}

// Unknown keys are stripped rather than refused.
const envelopeSchema = z.object({
  id: z.string().min(1).max(255),
  type: z.string().min(1).max(255),
});

/** A reference to another Stripe object, arriving as a bare id or as the expanded object. */
const stripeRef = z.union([
  z.string().min(1),
  z.object({ id: z.string().min(1) }).transform((object) => object.id),
]);

const checkoutCompletedSchema = z.object({
  type: z.literal('checkout.session.completed'),
  data: z.object({
    object: z.object({
      // Optional, so a field this handler can do without cannot cause a permanent 400.
      id: z.string().nullish(),
      customer: stripeRef,
      // Null on a session that bought something other than a subscription.
      subscription: stripeRef.nullish(),
      // Set by the checkout route. Sessions from other paths, the dashboard included, omit it.
      client_reference_id: z.string().nullish(),
      // 'paid', 'unpaid' or 'no_payment_required'. Absent on older API versions, read as unpaid.
      payment_status: z.string().nullish(),
      metadata: z.object({ org_id: z.string(), plan: z.string() }).partial().nullish(),
    }),
  }),
});

const subscriptionObjectSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  customer: stripeRef,
  // Set by the checkout route, so the plan travels with the subscription.
  metadata: z.object({ plan: z.string() }).partial().nullish(),
  items: z.object({
    data: z.array(z.object({
      // Omitted on metered items and some licensed ones, where one is the only answer.
      quantity: z.number().int().min(1).nullish(),
      price: z.object({ id: z.string() }).nullish(),
    })).min(1),
  }),
});

function subscriptionEventSchema<T extends string>(type: T) {
  return z.object({ type: z.literal(type), data: z.object({ object: subscriptionObjectSchema }) });
}

const handledEventSchema = z.discriminatedUnion('type', [
  checkoutCompletedSchema,
  subscriptionEventSchema('customer.subscription.updated'),
  subscriptionEventSchema('customer.subscription.deleted'),
]);

export type HandledEvent = z.infer<typeof handledEventSchema>;
export type HandledEventType = HandledEvent['type'];
type SubscriptionEventType = Exclude<HandledEventType, 'checkout.session.completed'>;

const HANDLED_TYPES: readonly HandledEventType[] = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

// The statuses a customer is still being served under; everything else is free.
const PAYING_STATUSES: readonly string[] = ['active', 'trialing', 'past_due'];

type SubscriptionObject = z.infer<typeof subscriptionObjectSchema>;

/** Which plan a subscription buys: metadata first, then the price, otherwise free. */
function planForSubscription(
  subscription: SubscriptionObject,
  teamPriceId: string | null,
): 'free' | 'team' {
  if (!PAYING_STATUSES.includes(subscription.status)) return 'free';

  const intended = subscription.metadata?.plan;
  if (intended === 'team') return 'team';
  if (intended === 'free') return 'free';

  const priceId = subscription.items.data[0].price?.id ?? null;
  if (teamPriceId !== null && priceId === teamPriceId) return 'team';

  // Audited, because the alternative is a customer paying for a plan they are not on.
  audit({
    action: 'billing.unrecognized_price',
    target: subscription.id,
    meta: { price_id: priceId, status: subscription.status, configured: teamPriceId !== null },
  });
  return 'free';
}

interface OrganizationPatch {
  plan?: 'free' | 'team';
  seats?: number;
  stripe_customer_id?: string;
  stripe_subscription_id?: string | null;
}

type OrgRow = { id: string };

export type StripeEventResult =
  | { kind: 'applied'; type: HandledEventType; orgId: string }
  | { kind: 'duplicate'; id: string }
  | { kind: 'ignored'; type: string; reason: string };

export interface BillingDeps {
  db: SupabaseClient;
  clock: ClockDeps;
  /** From SB_STRIPE_PRICE_TEAM. Null where billing is not configured. */
  teamPriceId: string | null;
}

function storageFailed(what: string, detail: string): ApiError {
  console.error('billing storage failed:', what, detail);
  return new ApiError(500, 'billing_unavailable', 'billing event could not be applied');
}

const UNIQUE_VIOLATION = '23505';

/** True when this call recorded the event, false when it was already there. */
async function claimEvent(
  db: SupabaseClient,
  id: string,
  type: string,
  at: Date,
): Promise<boolean> {
  const { error } = await db
    .from('stripe_events')
    .insert({ id, type, processed_at: at.toISOString() });
  if (error === null) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  throw storageFailed('stripe_events insert', error.message);
}

async function releaseEvent(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('stripe_events').delete().eq('id', id);
  // Logged rather than thrown: the caller is already failing.
  if (error !== null) console.error('stripe event marker not released', id, error.message);
}

async function findOrgId(
  db: SupabaseClient,
  column: 'stripe_subscription_id' | 'stripe_customer_id',
  value: string,
): Promise<string | null> {
  const { data, error } = await db.from('organizations').select('id').eq(column, value)
    .maybeSingle<OrgRow>();
  if (error !== null) throw storageFailed(`organizations select by ${column}`, error.message);
  return data === null ? null : data.id;
}

/** False when the id matched no organization, which is not an error here. */
async function updateOrganization(
  db: SupabaseClient,
  orgId: string,
  patch: OrganizationPatch,
): Promise<boolean> {
  const { data, error } = await db.from('organizations').update(patch).eq('id', orgId)
    .select('id').maybeSingle<OrgRow>();
  if (error !== null) throw storageFailed('organizations update', error.message);
  return data !== null;
}

function orgNotFound(type: HandledEventType, target: string): StripeEventResult {
  audit({ action: 'billing.org_not_found', target, meta: { type } });
  return { kind: 'ignored', type, reason: 'organization_not_found' };
}

type CheckoutSession = z.infer<typeof checkoutCompletedSchema>['data']['object'];

/** A session that has been paid for, or one Stripe took no payment for. */
const SETTLED_PAYMENT_STATUSES = ['paid', 'no_payment_required'];

/** The plan a completed checkout puts the organization on, or nothing. */
function planForCheckout(session: CheckoutSession): { plan?: 'free' | 'team' } {
  const status = session.payment_status ?? 'unpaid';
  if (!SETTLED_PAYMENT_STATUSES.includes(status)) return {};

  if (session.metadata?.plan === 'team') return { plan: 'team' };

  // Audited, because the alternative is a customer who paid and stayed on free.
  audit({
    action: 'billing.checkout_plan_unrecognized',
    target: session.id ?? session.customer,
    meta: { plan: session.metadata?.plan ?? null, payment_status: status },
  });
  return {};
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function applyCheckout(
  session: CheckoutSession,
  deps: BillingDeps,
): Promise<StripeEventResult> {
  const orgId = session.client_reference_id ?? session.metadata?.org_id ?? null;
  if (orgId === null || !UUID_RE.test(orgId)) {
    // Terminal rather than a 500: no retry will make an event name an organization.
    audit({ action: 'billing.org_not_identified', target: session.customer, meta: {} });
    return {
      kind: 'ignored',
      type: 'checkout.session.completed',
      reason: 'organization_not_identified',
    };
  }

  const found = await updateOrganization(deps.db, orgId, {
    stripe_customer_id: session.customer,
    // A session that bought no subscription leaves the column alone rather than clearing it.
    ...(session.subscription ? { stripe_subscription_id: session.subscription } : {}),
    ...planForCheckout(session),
  });
  if (!found) return orgNotFound('checkout.session.completed', orgId);
  return { kind: 'applied', type: 'checkout.session.completed', orgId };
}

async function applySubscription(
  type: SubscriptionEventType,
  subscription: SubscriptionObject,
  deps: BillingDeps,
): Promise<StripeEventResult> {
  // Subscription id is the precise handle; customer id catches an org checkout has not reached.
  const orgId = await findOrgId(deps.db, 'stripe_subscription_id', subscription.id) ??
    await findOrgId(deps.db, 'stripe_customer_id', subscription.customer);
  if (orgId === null) return orgNotFound(type, subscription.id);

  const patch: OrganizationPatch = type === 'customer.subscription.deleted'
    ? { plan: 'free', seats: 1, stripe_subscription_id: null }
    : {
      seats: subscription.items.data[0].quantity ?? 1,
      plan: planForSubscription(subscription, deps.teamPriceId),
    };

  const found = await updateOrganization(deps.db, orgId, patch);
  if (!found) return orgNotFound(type, subscription.id);
  return { kind: 'applied', type, orgId };
}

function applyEvent(event: HandledEvent, deps: BillingDeps): Promise<StripeEventResult> {
  switch (event.type) {
    case 'checkout.session.completed':
      return applyCheckout(event.data.object, deps);
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return applySubscription(event.type, event.data.object, deps);
    default: {
      const unreachable: never = event;
      throw new Error(`unhandled stripe event: ${JSON.stringify(unreachable)}`);
    }
  }
}

/** Records the event, then applies it. The record is released when applying fails. */
export async function handleStripeEvent(
  rawEvent: unknown,
  deps: BillingDeps,
): Promise<StripeEventResult> {
  const envelope = parseBody(envelopeSchema, rawEvent);

  const claimed = await claimEvent(deps.db, envelope.id, envelope.type, deps.clock.now());
  if (!claimed) return { kind: 'duplicate', id: envelope.id };

  const parsed = handledEventSchema.safeParse(rawEvent);
  if (!parsed.success) {
    // Both are terminal, so the record stays and Stripe stops redelivering.
    const known = HANDLED_TYPES.some((handled) => handled === envelope.type);
    const reason = known ? 'malformed_payload' : 'unhandled_type';
    const meta = { type: envelope.type, reason };
    audit({ action: 'billing.event_ignored', target: envelope.id, meta });
    return { kind: 'ignored', type: envelope.type, reason };
  }

  try {
    return await applyEvent(parsed.data, deps);
  } catch (err) {
    await releaseEvent(deps.db, envelope.id);
    throw err;
  }
}
