// The Stripe webhook endpoint. Every decision lives in _shared/billing.ts.

import { ApiError, jsonResponse, toErrorResponse } from '../_shared/errors.ts';
import { stripeEnv } from '../_shared/env.ts';
import { serviceClient } from '../_shared/db.ts';
import { liveClock } from '../_shared/deps.ts';
import { handleStripeEvent, verifyStripeSignature } from '../_shared/billing.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    if (req.method !== 'POST') {
      throw new ApiError(405, 'method_not_allowed', 'stripe webhooks arrive as POST');
    }

    const env = stripeEnv();
    const payload = await req.text();
    const verified = await verifyStripeSignature({
      payload,
      header: req.headers.get('Stripe-Signature'),
      secret: env.webhookSecret,
      now: liveClock.now(),
    });
    if (!verified.ok) {
      // The reason stays in the log; the caller learns only that the request was refused.
      console.warn('stripe signature refused:', verified.reason);
      throw new ApiError(400, 'invalid_signature', 'stripe signature did not verify');
    }

    let event: unknown;
    try {
      event = JSON.parse(payload);
    } catch {
      throw new ApiError(400, 'invalid_body', 'body is not valid json');
    }

    const result = await handleStripeEvent(event, {
      db: serviceClient(),
      clock: liveClock,
      teamPriceId: env.teamPriceId,
    });
    // 200 for a duplicate and an ignored type too, so Stripe stops redelivering.
    return jsonResponse({ received: true, result: result.kind });
  } catch (err) {
    return toErrorResponse(err);
  }
});
