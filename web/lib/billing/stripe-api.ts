import { z } from 'zod';

import type { PlanId } from './plans';

/** Two form encoded POSTs against Stripe's REST API. No SDK, so a stubbed fetch can test them. */
const CHECKOUT_ENDPOINT = 'https://api.stripe.com/v1/checkout/sessions';
const PORTAL_ENDPOINT = 'https://api.stripe.com/v1/billing_portal/sessions';

export type StripeFetch = typeof fetch;

const sessionSchema = z.object({ url: z.url() });
const errorSchema = z.object({ error: z.object({ message: z.string() }) });

async function postForm(
  endpoint: string,
  secretKey: string,
  params: URLSearchParams,
  stripeFetch: StripeFetch,
): Promise<string> {
  const response = await stripeFetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const body: unknown = await response.json();

  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    throw new Error(
      parsed.success ? parsed.data.error.message : `Stripe returned ${response.status}`,
    );
  }

  return sessionSchema.parse(body).url;
}

export type CheckoutRequest = {
  readonly secretKey: string;
  readonly priceId: string;
  readonly orgId: string;
  readonly plan: PlanId;
  readonly seats: number;
  readonly customerId: string | null;
  readonly customerEmail: string | null;
  readonly successUrl: string;
  readonly cancelUrl: string;
};

/** The org id travels as client_reference_id and in both metadata blocks, for the webhook. */
export async function createCheckoutSession(
  request: CheckoutRequest,
  stripeFetch: StripeFetch = fetch,
): Promise<string> {
  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': request.priceId,
    'line_items[0][quantity]': String(Math.max(request.seats, 1)),
    client_reference_id: request.orgId,
    'metadata[org_id]': request.orgId,
    'metadata[plan]': request.plan,
    'subscription_data[metadata][org_id]': request.orgId,
    'subscription_data[metadata][plan]': request.plan,
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
  });

  if (request.customerId) params.set('customer', request.customerId);
  else if (request.customerEmail) params.set('customer_email', request.customerEmail);

  return postForm(CHECKOUT_ENDPOINT, request.secretKey, params, stripeFetch);
}

export type PortalRequest = {
  readonly secretKey: string;
  readonly customerId: string;
  readonly returnUrl: string;
};

/** Everything after signup happens here, which is why there is no billing UI. */
export async function createPortalSession(
  request: PortalRequest,
  stripeFetch: StripeFetch = fetch,
): Promise<string> {
  const params = new URLSearchParams({
    customer: request.customerId,
    return_url: request.returnUrl,
  });

  return postForm(PORTAL_ENDPOINT, request.secretKey, params, stripeFetch);
}
