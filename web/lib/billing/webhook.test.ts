import { describe, expect, it } from 'vitest';

import { parseStripeEvent } from './events';
import checkoutCompleted from './fixtures/checkout-session-completed.json';
import invoicePaid from './fixtures/invoice-paid.json';
import subscriptionDeleted from './fixtures/subscription-deleted.json';
import subscriptionUnknownPrice from './fixtures/subscription-updated-unknown-price.json';
import subscriptionUnpaid from './fixtures/subscription-updated-unpaid.json';
import subscriptionUpdated from './fixtures/subscription-updated.json';
import { handleBillingEvent, type BillingClient } from './webhook';

const PRICES = { teamPriceId: 'price_team_test' };
const ORG = '11111111-1111-4111-8111-111111111111';

type Write = { readonly table: string; readonly op: string; readonly values?: unknown };

type Fake = {
  readonly client: BillingClient;
  readonly writes: readonly Write[];
  readonly seenEventIds: readonly string[];
};

/**
 * A client that keeps the two tables the handler touches in memory. The cast is
 * confined here: the handler only ever reaches for organizations and
 * stripe_events, and standing those up is what makes a fixture-driven test of
 * the real handler possible with no Stripe account and no database.
 */
function createFake({
  organizations = [{ id: ORG, stripe_customer_id: 'cus_TestTeam01' }],
  seenEventIds = [],
  failUpdate = false,
}: {
  organizations?: readonly { id: string; stripe_customer_id: string | null }[];
  seenEventIds?: readonly string[];
  failUpdate?: boolean;
} = {}): Fake {
  const writes: Write[] = [];
  const seen = new Set(seenEventIds);

  const stripeEvents = {
    insert: (values: { id: string; type: string }) => {
      writes.push({ table: 'stripe_events', op: 'insert', values });
      if (seen.has(values.id)) {
        return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
      }
      seen.add(values.id);
      return Promise.resolve({ error: null });
    },
    delete: () => ({
      eq: (_column: string, id: unknown) => {
        writes.push({ table: 'stripe_events', op: 'delete', values: id });
        seen.delete(String(id));
        return Promise.resolve({ error: null });
      },
    }),
  };

  const organizationsTable = {
    select: () => {
      const filters: Record<string, unknown> = {};
      const builder = {
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        maybeSingle: () => {
          const match = organizations.find((row) =>
            Object.entries(filters).every(
              ([column, value]) => row[column as 'id' | 'stripe_customer_id'] === value,
            ),
          );
          return Promise.resolve({ data: match ? { id: match.id } : null, error: null });
        },
      };
      return builder;
    },
    update: (values: unknown) => {
      const builder = {
        eq: (_column: string, id: unknown) => {
          writes.push({
            table: 'organizations',
            op: 'update',
            values: { id, ...(values as object) },
          });
          return builder;
        },
        select: () => {
          if (failUpdate)
            return Promise.resolve({ data: null, error: { message: 'update failed' } });
          return Promise.resolve({ data: [{ id: ORG }], error: null });
        },
      };
      return builder;
    },
  };

  const client = {
    from: (table: string) => (table === 'stripe_events' ? stripeEvents : organizationsTable),
  } as unknown as BillingClient;

  return { client, writes, seenEventIds: [...seen] };
}

describe('handling a Stripe webhook', () => {
  it('files the customer and subscription against the organization that checked out', async () => {
    const fake = createFake();

    const outcome = await handleBillingEvent(
      parseStripeEvent(checkoutCompleted),
      fake.client,
      PRICES,
    );

    expect(outcome).toEqual({
      kind: 'applied',
      eventId: 'evt_checkout_completed',
      orgId: ORG,
      plan: 'team',
    });
    expect(fake.writes).toContainEqual({
      table: 'organizations',
      op: 'update',
      values: {
        id: ORG,
        plan: 'team',
        stripe_customer_id: 'cus_TestTeam01',
        stripe_subscription_id: 'sub_TestTeam01',
      },
    });
  });

  it('moves the organization onto the plan its price names, with its seat count', async () => {
    const fake = createFake();

    const outcome = await handleBillingEvent(
      parseStripeEvent(subscriptionUpdated),
      fake.client,
      PRICES,
    );

    expect(outcome).toEqual({
      kind: 'applied',
      eventId: 'evt_subscription_updated',
      orgId: ORG,
      plan: 'team',
    });
    expect(fake.writes).toContainEqual({
      table: 'organizations',
      op: 'update',
      values: {
        id: ORG,
        plan: 'team',
        seats: 7,
        stripe_subscription_id: 'sub_TestTeam01',
      },
    });
  });

  it('drops a lapsed subscription back to Free without waiting for a deletion', async () => {
    const fake = createFake();

    const outcome = await handleBillingEvent(
      parseStripeEvent(subscriptionUnpaid),
      fake.client,
      PRICES,
    );

    expect(outcome.kind === 'applied' && outcome.plan).toBe('free');
  });

  it('returns the organization to Free and forgets the subscription on cancellation', async () => {
    const fake = createFake();

    await handleBillingEvent(parseStripeEvent(subscriptionDeleted), fake.client, PRICES);

    expect(fake.writes).toContainEqual({
      table: 'organizations',
      op: 'update',
      values: { id: ORG, plan: 'free', seats: 1, stripe_subscription_id: null },
    });
  });

  it('changes nothing on a second delivery of the same event', async () => {
    const fake = createFake({ seenEventIds: ['evt_subscription_updated'] });

    const outcome = await handleBillingEvent(
      parseStripeEvent(subscriptionUpdated),
      fake.client,
      PRICES,
    );

    expect(outcome).toEqual({ kind: 'duplicate', eventId: 'evt_subscription_updated' });
    expect(fake.writes.filter((write) => write.table === 'organizations')).toEqual([]);
  });

  it('does not claim an event type it has no opinion about', async () => {
    const fake = createFake();

    const outcome = await handleBillingEvent(parseStripeEvent(invoicePaid), fake.client, PRICES);

    expect(outcome).toEqual({
      kind: 'ignored',
      eventId: 'evt_invoice_paid',
      reason: 'nothing to do for invoice.paid',
    });
    expect(fake.writes).toEqual([]);
  });

  it('leaves the plan alone when the price is one we do not sell', async () => {
    const fake = createFake();

    const outcome = await handleBillingEvent(
      parseStripeEvent(subscriptionUnknownPrice),
      fake.client,
      PRICES,
    );

    expect(outcome).toEqual({
      kind: 'ignored',
      eventId: 'evt_subscription_unknown_price',
      reason: 'no plan configured for price price_legacy_migrated',
    });
    expect(fake.writes.filter((write) => write.op === 'update')).toEqual([]);
  });

  it('releases the claim when it cannot find the customer, so a retry can succeed', async () => {
    const fake = createFake({ organizations: [] });

    const outcome = await handleBillingEvent(
      parseStripeEvent(subscriptionUpdated),
      fake.client,
      PRICES,
    );

    expect(outcome).toEqual({
      kind: 'ignored',
      eventId: 'evt_subscription_updated',
      reason: 'no organization for customer cus_TestTeam01',
    });
    expect(fake.writes).toContainEqual({
      table: 'stripe_events',
      op: 'delete',
      values: 'evt_subscription_updated',
    });
  });

  it('releases the claim and rethrows when the update itself fails', async () => {
    const fake = createFake({ failUpdate: true });

    await expect(
      handleBillingEvent(parseStripeEvent(subscriptionUpdated), fake.client, PRICES),
    ).rejects.toThrow('update failed');

    expect(fake.writes).toContainEqual({
      table: 'stripe_events',
      op: 'delete',
      values: 'evt_subscription_updated',
    });
  });
});
