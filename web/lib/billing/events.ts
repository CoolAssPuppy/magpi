import { z } from 'zod';

import type { Database } from '@/lib/database.types';

type PlanId = Database['public']['Enums']['org_plan'];

/**
 * Stripe returns a bare id where a resource is not expanded and the object where
 * it is. We never expand, but a replayed event from the dashboard can arrive
 * either way and both mean the same thing.
 */
const stripeId = z.union([z.string(), z.object({ id: z.string() }).transform((value) => value.id)]);

const planId: z.ZodType<PlanId> = z.enum(['free', 'team', 'enterprise']);

const envelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.unknown() }),
});

const checkoutSessionSchema = z.object({
  client_reference_id: z.string().nullable(),
  customer: stripeId.nullable(),
  subscription: stripeId.nullable(),
  metadata: z
    .object({ org_id: z.string().optional(), plan: planId.optional() })
    .nullable()
    .optional(),
});

const subscriptionSchema = z.object({
  id: z.string(),
  customer: stripeId,
  status: z.string(),
  items: z.object({
    data: z
      .array(
        z.object({
          quantity: z.number().int().positive().nullable().optional(),
          price: z.object({ id: z.string() }),
        }),
      )
      .min(1),
  }),
});

const deletedSubscriptionSchema = z.object({
  id: z.string(),
  customer: stripeId,
});

/**
 * What the webhook handler acts on, once the Stripe shape is behind us. Every
 * event type we do not act on becomes `ignored` rather than an error, because a
 * Stripe endpoint receives more than it subscribes to and a 400 makes Stripe
 * retry something that will never succeed.
 */
export type BillingEvent =
  | {
      readonly kind: 'checkout-completed';
      readonly eventId: string;
      readonly orgId: string | null;
      readonly plan: PlanId | null;
      readonly customerId: string | null;
      readonly subscriptionId: string | null;
    }
  | {
      readonly kind: 'subscription-changed';
      readonly eventId: string;
      readonly customerId: string;
      readonly subscriptionId: string;
      readonly status: string;
      readonly priceId: string;
      readonly seats: number;
    }
  | {
      readonly kind: 'subscription-deleted';
      readonly eventId: string;
      readonly customerId: string;
      readonly subscriptionId: string;
    }
  | { readonly kind: 'ignored'; readonly eventId: string; readonly type: string };

/** Throws on a body that claims to be an event we handle but is not shaped like one. */
export function parseStripeEvent(raw: unknown): BillingEvent {
  const envelope = envelopeSchema.parse(raw);

  switch (envelope.type) {
    case 'checkout.session.completed': {
      const session = checkoutSessionSchema.parse(envelope.data.object);
      return {
        kind: 'checkout-completed',
        eventId: envelope.id,
        orgId: session.client_reference_id ?? session.metadata?.org_id ?? null,
        plan: session.metadata?.plan ?? null,
        customerId: session.customer,
        subscriptionId: session.subscription,
      };
    }

    case 'customer.subscription.updated': {
      const subscription = subscriptionSchema.parse(envelope.data.object);
      const item = subscription.items.data[0];
      return {
        kind: 'subscription-changed',
        eventId: envelope.id,
        customerId: subscription.customer,
        subscriptionId: subscription.id,
        status: subscription.status,
        priceId: item.price.id,
        seats: item.quantity ?? 1,
      };
    }

    case 'customer.subscription.deleted': {
      const subscription = deletedSubscriptionSchema.parse(envelope.data.object);
      return {
        kind: 'subscription-deleted',
        eventId: envelope.id,
        customerId: subscription.customer,
        subscriptionId: subscription.id,
      };
    }

    default:
      return { kind: 'ignored', eventId: envelope.id, type: envelope.type };
  }
}
