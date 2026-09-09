import { describe, expect, it, vi } from 'vitest';

import { createCheckoutSession, createPortalSession } from './stripe-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function paramsOf(call: readonly unknown[]): URLSearchParams {
  const init = call[1] as RequestInit;
  return new URLSearchParams(String(init.body));
}

const ORG = '11111111-1111-4111-8111-111111111111';

describe('creating a checkout session', () => {
  it('asks Stripe for a subscription checkout carrying the organization', async () => {
    const stripeFetch = vi.fn().mockResolvedValue(jsonResponse({ url: 'https://checkout.test/1' }));

    const url = await createCheckoutSession(
      {
        secretKey: 'sk_test',
        priceId: 'price_team_test',
        orgId: ORG,
        plan: 'team',
        seats: 4,
        customerEmail: 'ada@example.com',
        customerId: null,
        successUrl: 'https://recall.test/admin/billing?checkout=done',
        cancelUrl: 'https://recall.test/admin/billing',
      },
      stripeFetch,
    );

    expect(url).toBe('https://checkout.test/1');

    const params = paramsOf(stripeFetch.mock.calls[0]);
    expect(stripeFetch.mock.calls[0][0]).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(params.get('mode')).toBe('subscription');
    expect(params.get('line_items[0][price]')).toBe('price_team_test');
    expect(params.get('line_items[0][quantity]')).toBe('4');
    expect(params.get('client_reference_id')).toBe(ORG);
    expect(params.get('metadata[org_id]')).toBe(ORG);
    expect(params.get('metadata[plan]')).toBe('team');
    expect(params.get('customer_email')).toBe('ada@example.com');
  });

  it('reuses an existing Stripe customer rather than making a second one', async () => {
    const stripeFetch = vi.fn().mockResolvedValue(jsonResponse({ url: 'https://checkout.test/2' }));

    await createCheckoutSession(
      {
        secretKey: 'sk_test',
        priceId: 'price_team_test',
        orgId: ORG,
        plan: 'team',
        seats: 1,
        customerEmail: 'ada@example.com',
        customerId: 'cus_existing',
        successUrl: 'https://recall.test/admin/billing',
        cancelUrl: 'https://recall.test/admin/billing',
      },
      stripeFetch,
    );

    const params = paramsOf(stripeFetch.mock.calls[0]);
    expect(params.get('customer')).toBe('cus_existing');
    expect(params.get('customer_email')).toBeNull();
  });

  it('reports the message Stripe gave when it refuses', async () => {
    const stripeFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: 'No such price' } }, 400));

    await expect(
      createCheckoutSession(
        {
          secretKey: 'sk_test',
          priceId: 'price_missing',
          orgId: ORG,
          plan: 'team',
          seats: 1,
          customerEmail: null,
          customerId: null,
          successUrl: 'https://recall.test/admin/billing',
          cancelUrl: 'https://recall.test/admin/billing',
        },
        stripeFetch,
      ),
    ).rejects.toThrow('No such price');
  });

  it('refuses a response with no url in it', async () => {
    const stripeFetch = vi.fn().mockResolvedValue(jsonResponse({ id: 'cs_test', url: null }));

    await expect(
      createCheckoutSession(
        {
          secretKey: 'sk_test',
          priceId: 'price_team_test',
          orgId: ORG,
          plan: 'team',
          seats: 1,
          customerEmail: null,
          customerId: null,
          successUrl: 'https://recall.test/admin/billing',
          cancelUrl: 'https://recall.test/admin/billing',
        },
        stripeFetch,
      ),
    ).rejects.toThrow();
  });
});

describe('creating a customer portal session', () => {
  it('sends the customer and where to come back to', async () => {
    const stripeFetch = vi.fn().mockResolvedValue(jsonResponse({ url: 'https://portal.test/1' }));

    const url = await createPortalSession(
      {
        secretKey: 'sk_test',
        customerId: 'cus_existing',
        returnUrl: 'https://recall.test/admin/billing',
      },
      stripeFetch,
    );

    expect(url).toBe('https://portal.test/1');

    const params = paramsOf(stripeFetch.mock.calls[0]);
    expect(stripeFetch.mock.calls[0][0]).toBe('https://api.stripe.com/v1/billing_portal/sessions');
    expect(params.get('customer')).toBe('cus_existing');
    expect(params.get('return_url')).toBe('https://recall.test/admin/billing');
  });

  it('reports the message Stripe gave when it refuses', async () => {
    const stripeFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: 'No such customer' } }, 404));

    await expect(
      createPortalSession(
        { secretKey: 'sk_test', customerId: 'cus_gone', returnUrl: 'https://recall.test' },
        stripeFetch,
      ),
    ).rejects.toThrow('No such customer');
  });
});
