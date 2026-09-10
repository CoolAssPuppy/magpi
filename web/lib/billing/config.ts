import { z } from 'zod';

import type { PriceMap } from './plans';

/** Only the Stripe env the checkout and portal routes need, parsed on every call. */
const schema = z.object({
  SB_STRIPE_SECRET_KEY: z.string().min(1),
  SB_STRIPE_PRICE_TEAM: z.string().min(1),
});

export type BillingConfig = {
  readonly secretKey: string;
  readonly prices: PriceMap;
};

function readEnv(): Record<string, string | undefined> {
  return {
    SB_STRIPE_SECRET_KEY: process.env.SB_STRIPE_SECRET_KEY,
    SB_STRIPE_PRICE_TEAM: process.env.SB_STRIPE_PRICE_TEAM,
  };
}

/** Whether this deployment can start a paid flow, against the schema billingConfig() parses. */
export function isBillingConfigured(): boolean {
  return schema.safeParse(readEnv()).success;
}

export function billingConfig(): BillingConfig {
  const env = schema.parse(readEnv());

  return {
    secretKey: env.SB_STRIPE_SECRET_KEY,
    prices: { teamPriceId: env.SB_STRIPE_PRICE_TEAM },
  };
}
