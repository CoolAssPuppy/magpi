import { z } from 'zod';

import type { PriceMap } from './plans';

/**
 * Only what the checkout and portal routes need. SB_STRIPE_WEBHOOK_SECRET is
 * absent on purpose: the webhook is an Edge Function, and reading a secret here
 * that this runtime never uses would fail checkout on a deployment that has no
 * reason to hold it.
 *
 * SB_ prefix throughout: Supabase reserves SUPABASE_, and a secrets manager
 * syncing into a project cannot write one.
 *
 * Parsed on every call rather than at module load, so a deploy that is missing a
 * credential fails on the billing route instead of at import time, taking the
 * rest of the app with it.
 */
const schema = z.object({
  SB_STRIPE_SECRET_KEY: z.string().min(1),
  SB_STRIPE_PRICE_TEAM: z.string().min(1),
});

export type BillingConfig = {
  readonly secretKey: string;
  readonly prices: PriceMap;
};

export function billingConfig(): BillingConfig {
  const env = schema.parse({
    SB_STRIPE_SECRET_KEY: process.env.SB_STRIPE_SECRET_KEY,
    SB_STRIPE_PRICE_TEAM: process.env.SB_STRIPE_PRICE_TEAM,
  });

  return {
    secretKey: env.SB_STRIPE_SECRET_KEY,
    prices: { teamPriceId: env.SB_STRIPE_PRICE_TEAM },
  };
}
