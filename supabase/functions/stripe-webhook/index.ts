// The Stripe webhook endpoint. Everything it decides lives in _shared/billing.ts;
// this file only moves bytes between Stripe and that module.
//
// Deno.serve directly rather than the shared serveFunction: that shell parses
// the body as JSON, and a Stripe signature covers the exact bytes that arrived,
// so hashing a reserialized object would never match. There is no browser
// caller here either, so the CORS layer it adds has nobody to answer.

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

    const payload = await req.text();
    const verified = await verifyStripeSignature({
      payload,
      header: req.headers.get('Stripe-Signature'),
      secret: stripeEnv().webhookSecret,
      now: liveClock.now(),
    });
    if (!verified.ok) {
      // The reason stays in the log. A caller probing the endpoint learns only
      // that the request was refused.
      console.warn('stripe signature refused:', verified.reason);
      throw new ApiError(400, 'invalid_signature', 'stripe signature did not verify');
    }

    let event: unknown;
    try {
      event = JSON.parse(payload);
    } catch {
      throw new ApiError(400, 'invalid_body', 'body is not valid json');
    }

    const result = await handleStripeEvent(event, { db: serviceClient(), clock: liveClock });
    // 200 for a duplicate and for an ignored type as much as for an applied one:
    // anything else makes Stripe redeliver an event there is nothing left to do
    // with, for days.
    return jsonResponse({ received: true, result: result.kind });
  } catch (err) {
    return toErrorResponse(err);
  }
});
