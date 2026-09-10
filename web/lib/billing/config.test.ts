import { afterEach, describe, expect, it } from 'vitest';

import { billingConfig, isBillingConfigured } from './config';

const KEYS = ['SB_STRIPE_SECRET_KEY', 'SB_STRIPE_WEBHOOK_SECRET', 'SB_STRIPE_PRICE_TEAM'] as const;

function withStripeEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => withStripeEnv({}));

describe('billing configuration', () => {
  it('reads the two SB_ prefixed values checkout and the portal need', () => {
    withStripeEnv({ SB_STRIPE_SECRET_KEY: 'sk_test_1', SB_STRIPE_PRICE_TEAM: 'price_team_1' });

    expect(billingConfig()).toEqual({
      secretKey: 'sk_test_1',
      prices: { teamPriceId: 'price_team_1' },
    });
  });

  it('does not ask for the webhook secret, which belongs to the edge function', () => {
    withStripeEnv({ SB_STRIPE_SECRET_KEY: 'sk_test_1', SB_STRIPE_PRICE_TEAM: 'price_team_1' });
    delete process.env.SB_STRIPE_WEBHOOK_SECRET;

    expect(() => billingConfig()).not.toThrow();
  });

  it('fails loudly when a credential is missing rather than half working', () => {
    withStripeEnv({ SB_STRIPE_SECRET_KEY: 'sk_test_1' });

    expect(() => billingConfig()).toThrow();
  });
});

describe('whether this deployment can reach Stripe at all', () => {
  it('is configured when both the key and the price are set', () => {
    withStripeEnv({ SB_STRIPE_SECRET_KEY: 'sk_test_1', SB_STRIPE_PRICE_TEAM: 'price_team_1' });

    expect(isBillingConfigured()).toBe(true);
  });

  it('is unconfigured when the price is missing, because checkout needs one', () => {
    withStripeEnv({ SB_STRIPE_SECRET_KEY: 'sk_test_1' });

    expect(isBillingConfigured()).toBe(false);
  });

  it('is unconfigured when nothing is set', () => {
    withStripeEnv({});

    expect(isBillingConfigured()).toBe(false);
  });

  // A true here that billingConfig() would reject puts a form on the page that throws.
  it('answers true only where billingConfig can be read', () => {
    withStripeEnv({ SB_STRIPE_SECRET_KEY: 'sk_test_1', SB_STRIPE_PRICE_TEAM: 'price_team_1' });
    expect(isBillingConfigured()).toBe(true);
    expect(() => billingConfig()).not.toThrow();

    withStripeEnv({ SB_STRIPE_PRICE_TEAM: 'price_team_1' });
    expect(isBillingConfigured()).toBe(false);
  });
});
