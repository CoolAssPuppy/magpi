import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

import type { BillingEvent } from './events';
import { planForPriceId, type PlanId, type PriceMap } from './plans';

export type BillingClient = SupabaseClient<Database>;

export type WebhookOutcome =
  | {
      readonly kind: 'applied';
      readonly eventId: string;
      readonly orgId: string;
      readonly plan: PlanId;
    }
  | { readonly kind: 'duplicate'; readonly eventId: string }
  | { readonly kind: 'ignored'; readonly eventId: string; readonly reason: string };

/** Postgres unique violation. Stripe retries, and this is how a retry is a no-op. */
const UNIQUE_VIOLATION = '23505';

/**
 * Statuses where the subscription no longer entitles anything. `past_due` is
 * deliberately absent: Stripe is still retrying the card and cutting access
 * during a grace period is how a paying customer loses their knowledge base
 * over a expired card.
 */
const LAPSED_STATUSES: ReadonlySet<string> = new Set([
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
]);

function stripeTypeOf(event: BillingEvent): string {
  switch (event.kind) {
    case 'checkout-completed':
      return 'checkout.session.completed';
    case 'subscription-changed':
      return 'customer.subscription.updated';
    case 'subscription-deleted':
      return 'customer.subscription.deleted';
    case 'ignored':
      return event.type;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

async function claimEvent(client: BillingClient, id: string, type: string): Promise<boolean> {
  const { error } = await client.from('stripe_events').insert({ id, type });
  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  throw new Error(error.message);
}

async function releaseEvent(client: BillingClient, id: string): Promise<void> {
  await client.from('stripe_events').delete().eq('id', id);
}

async function findOrgByCustomer(
  client: BillingClient,
  customerId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

async function updateOrganization(
  client: BillingClient,
  orgId: string,
  values: Database['public']['Tables']['organizations']['Update'],
): Promise<void> {
  const { error } = await client.from('organizations').update(values).eq('id', orgId).select('id');
  if (error) throw new Error(error.message);
}

function ignored(eventId: string, reason: string): WebhookOutcome {
  return { kind: 'ignored', eventId, reason };
}

async function applyCheckout(
  event: Extract<BillingEvent, { kind: 'checkout-completed' }>,
  client: BillingClient,
): Promise<WebhookOutcome> {
  if (!event.orgId) return ignored(event.eventId, 'checkout session carried no organization');
  if (!event.plan) return ignored(event.eventId, 'checkout session carried no plan');

  await updateOrganization(client, event.orgId, {
    plan: event.plan,
    stripe_customer_id: event.customerId,
    stripe_subscription_id: event.subscriptionId,
  });

  return { kind: 'applied', eventId: event.eventId, orgId: event.orgId, plan: event.plan };
}

async function applySubscriptionChange(
  event: Extract<BillingEvent, { kind: 'subscription-changed' }>,
  client: BillingClient,
  prices: PriceMap,
): Promise<WebhookOutcome> {
  const orgId = await findOrgByCustomer(client, event.customerId);
  if (!orgId) return ignored(event.eventId, `no organization for customer ${event.customerId}`);

  const lapsed = LAPSED_STATUSES.has(event.status);
  const plan = lapsed ? 'free' : planForPriceId(event.priceId, prices);
  if (!plan) return ignored(event.eventId, `no plan configured for price ${event.priceId}`);

  await updateOrganization(client, orgId, {
    plan,
    seats: lapsed ? 1 : Math.max(event.seats, 1),
    stripe_subscription_id: event.subscriptionId,
  });

  return { kind: 'applied', eventId: event.eventId, orgId, plan };
}

async function applySubscriptionDeletion(
  event: Extract<BillingEvent, { kind: 'subscription-deleted' }>,
  client: BillingClient,
): Promise<WebhookOutcome> {
  const orgId = await findOrgByCustomer(client, event.customerId);
  if (!orgId) return ignored(event.eventId, `no organization for customer ${event.customerId}`);

  await updateOrganization(client, orgId, {
    plan: 'free',
    seats: 1,
    stripe_subscription_id: null,
  });

  return { kind: 'applied', eventId: event.eventId, orgId, plan: 'free' };
}

function apply(
  event: BillingEvent,
  client: BillingClient,
  prices: PriceMap,
): Promise<WebhookOutcome> {
  switch (event.kind) {
    case 'checkout-completed':
      return applyCheckout(event, client);
    case 'subscription-changed':
      return applySubscriptionChange(event, client, prices);
    case 'subscription-deleted':
      return applySubscriptionDeletion(event, client);
    case 'ignored':
      return Promise.resolve(ignored(event.eventId, `nothing to do for ${event.type}`));
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/**
 * The whole webhook, as a pure function of a parsed event and a client. Nothing
 * in here reads a network or an environment variable, which is what lets the
 * fixtures in ./fixtures stand in for a Stripe account we do not have.
 *
 * The event id is claimed before the change is applied, so two concurrent
 * deliveries cannot both proceed, and the claim is released again whenever the
 * change did not happen, so a Stripe retry still has a chance to work.
 */
export async function handleBillingEvent(
  event: BillingEvent,
  client: BillingClient,
  prices: PriceMap,
): Promise<WebhookOutcome> {
  if (event.kind === 'ignored') {
    return ignored(event.eventId, `nothing to do for ${event.type}`);
  }

  const claimed = await claimEvent(client, event.eventId, stripeTypeOf(event));
  if (!claimed) return { kind: 'duplicate', eventId: event.eventId };

  try {
    const outcome = await apply(event, client, prices);
    if (outcome.kind !== 'applied') await releaseEvent(client, event.eventId);
    return outcome;
  } catch (error) {
    await releaseEvent(client, event.eventId);
    throw error;
  }
}
