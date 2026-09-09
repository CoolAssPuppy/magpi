import { describe, expect, it } from 'vitest';

import checkoutCompleted from './fixtures/checkout-session-completed.json';
import invoicePaid from './fixtures/invoice-paid.json';
import subscriptionDeleted from './fixtures/subscription-deleted.json';
import subscriptionUnknownPrice from './fixtures/subscription-updated-unknown-price.json';
import subscriptionUnpaid from './fixtures/subscription-updated-unpaid.json';
import subscriptionUpdated from './fixtures/subscription-updated.json';
import { parseStripeEvent } from './events';

describe('parsing a Stripe event', () => {
  it('reads the organization and both ids off a completed checkout', () => {
    expect(parseStripeEvent(checkoutCompleted)).toEqual({
      kind: 'checkout-completed',
      eventId: 'evt_checkout_completed',
      orgId: '11111111-1111-4111-8111-111111111111',
      plan: 'team',
      customerId: 'cus_TestTeam01',
      subscriptionId: 'sub_TestTeam01',
    });
  });

  it('reads the price, seat count and status off a subscription change', () => {
    expect(parseStripeEvent(subscriptionUpdated)).toEqual({
      kind: 'subscription-changed',
      eventId: 'evt_subscription_updated',
      customerId: 'cus_TestTeam01',
      subscriptionId: 'sub_TestTeam01',
      status: 'active',
      priceId: 'price_team_test',
      seats: 7,
    });
  });

  it('keeps a lapsed status rather than normalizing it away', () => {
    const event = parseStripeEvent(subscriptionUnpaid);

    expect(event.kind).toBe('subscription-changed');
    expect(event.kind === 'subscription-changed' && event.status).toBe('unpaid');
  });

  it('reads a cancellation', () => {
    expect(parseStripeEvent(subscriptionDeleted)).toEqual({
      kind: 'subscription-deleted',
      eventId: 'evt_subscription_deleted',
      customerId: 'cus_TestTeam01',
      subscriptionId: 'sub_TestTeam01',
    });
  });

  it('names an event it does not act on instead of failing', () => {
    expect(parseStripeEvent(invoicePaid)).toEqual({
      kind: 'ignored',
      eventId: 'evt_invoice_paid',
      type: 'invoice.paid',
    });
  });

  it('reads an expanded customer object as its id', () => {
    const expanded = {
      ...subscriptionDeleted,
      data: {
        object: {
          ...subscriptionDeleted.data.object,
          customer: { id: 'cus_TestTeam01', object: 'customer' },
        },
      },
    };

    const event = parseStripeEvent(expanded);

    expect(event.kind === 'subscription-deleted' && event.customerId).toBe('cus_TestTeam01');
  });

  it('refuses a body that is not a Stripe event at all', () => {
    expect(() => parseStripeEvent({ hello: 'world' })).toThrow();
  });

  it('refuses a known event type whose payload is missing its subscription', () => {
    expect(() =>
      parseStripeEvent({
        id: 'evt_broken',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active' } },
      }),
    ).toThrow();
  });

  it('refuses a checkout whose plan is not one we sell', () => {
    expect(() =>
      parseStripeEvent({
        ...checkoutCompleted,
        data: {
          object: {
            ...checkoutCompleted.data.object,
            metadata: { org_id: '11111111-1111-4111-8111-111111111111', plan: 'platinum' },
          },
        },
      }),
    ).toThrow();
  });
});
