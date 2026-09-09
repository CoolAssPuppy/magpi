import { afterEach, describe, expect, it } from 'vitest';

import { billingConfig } from './config';

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
