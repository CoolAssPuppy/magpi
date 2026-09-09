// Stripe webhooks: verifying that a request came from Stripe, and applying the
// three events that move an organization between plans. No Deno.serve and no
// global env reads, so every decision here is testable without a server.

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

/**
 * Stripe's own scheme, implemented here rather than pulled from the SDK. A value
 * comes back instead of a throw: the caller decides that a refusal is a 400, and
 * nothing else about the request has been read yet.
 */
export async function verifyStripeSignature(input: SignatureInput): Promise<SignatureResult> {
  if (input.header === null || input.header.trim().length === 0) {
    return { ok: false, reason: 'missing_signature_header' };
  }

  const parsed = parseSignatureHeader(input.header);
  if (parsed === null) return { ok: false, reason: 'malformed_signature_header' };

  // Without this a request captured off the wire stays valid forever, because
  // its signature never stops being arithmetically correct.
  const tolerance = input.toleranceSeconds ?? TOLERANCE_SECONDS;
  if (Math.abs(input.now.getTime() / 1000 - parsed.timestamp) > tolerance) {
    return { ok: false, reason: 'timestamp_outside_tolerance' };
  }

  const expected = await hmacSha256Hex(input.secret, `${parsed.timestamp}.${input.payload}`);
  // Every candidate is compared even once one has matched, so the count of
  // comparisons does not report where in the list the match was.
  let matched = false;
  for (const candidate of parsed.signatures) {
    if (timingSafeEqual(candidate, expected)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: 'no_matching_signature' };
}

// Stripe events carry dozens of fields these handlers never read, so unknown
// keys are stripped rather than refused.
const envelopeSchema = z.object({
  id: z.string().min(1).max(255),
  type: z.string().min(1).max(255),
});

const checkoutCompletedSchema = z.object({
  type: z.literal('checkout.session.completed'),
  data: z.object({
    object: z.object({
      customer: z.string().min(1),
      subscription: z.string().min(1),
      metadata: z.object({ org_id: z.uuid() }),
    }),
  }),
});

const subscriptionObjectSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  customer: z.string().min(1),
  items: z.object({ data: z.array(z.object({ quantity: z.number().int().min(1) })).min(1) }),
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
  // Logged rather than thrown: the caller is already failing, and this line
  // only says the retry will be turned away as a duplicate.
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

async function applyCheckout(
  session: CheckoutSession,
  deps: BillingDeps,
): Promise<StripeEventResult> {
  const orgId = session.metadata.org_id;
  const found = await updateOrganization(deps.db, orgId, {
    stripe_customer_id: session.customer,
    stripe_subscription_id: session.subscription,
    plan: 'team',
  });
  if (!found) return orgNotFound('checkout.session.completed', orgId);
  return { kind: 'applied', type: 'checkout.session.completed', orgId };
}

async function applySubscription(
  type: SubscriptionEventType,
  subscription: z.infer<typeof subscriptionObjectSchema>,
  deps: BillingDeps,
): Promise<StripeEventResult> {
  // The subscription id is the precise handle; the customer id catches an org
  // whose checkout event has not been applied yet.
  const orgId = await findOrgId(deps.db, 'stripe_subscription_id', subscription.id) ??
    await findOrgId(deps.db, 'stripe_customer_id', subscription.customer);
  if (orgId === null) return orgNotFound(type, subscription.id);

  const patch: OrganizationPatch = type === 'customer.subscription.deleted'
    ? { plan: 'free', seats: 1, stripe_subscription_id: null }
    : {
      seats: subscription.items.data[0].quantity,
      plan: PAYING_STATUSES.includes(subscription.status) ? 'team' : 'free',
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

/**
 * Records the event, then applies it.
 *
 * The record goes in first because Stripe redelivers an event until it gets a
 * 2xx, and a plan flip or a seat change applied twice is worse than one applied
 * late: a redelivery conflicts on the primary key and stops here. When the work
 * that follows fails the record is released, so the redelivery a 500 asks for is
 * not turned away as a duplicate.
 */
export async function handleStripeEvent(
  rawEvent: unknown,
  deps: BillingDeps,
): Promise<StripeEventResult> {
  const envelope = parseBody(envelopeSchema, rawEvent);

  const claimed = await claimEvent(deps.db, envelope.id, envelope.type, deps.clock.now());
  if (!claimed) return { kind: 'duplicate', id: envelope.id };

  const parsed = handledEventSchema.safeParse(rawEvent);
  if (!parsed.success) {
    // A type nobody reads, or one whose payload is not the shape read here.
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
