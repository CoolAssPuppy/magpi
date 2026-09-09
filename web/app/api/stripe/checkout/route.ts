import { billingConfig } from '@/lib/billing/config';
import { createCheckoutSession } from '@/lib/billing/stripe-api';

import { BILLING_PATH, billingRedirect, resolveBillingCaller } from '../session';

export const runtime = 'nodejs';

/**
 * Starts Stripe Checkout and hands the browser to Stripe.
 *
 * A route handler rather than a server action because the destination is another
 * site, and the plan is not written here: the webhook writes it when Stripe
 * confirms the money.
 */
export async function POST(request: Request): Promise<Response> {
  const caller = await resolveBillingCaller(request);
  if (caller.kind === 'refused') return caller.response;

  const { context, origin } = caller;

  const { data: organization } = await context.supabase
    .from('organizations')
    .select('stripe_customer_id, seats')
    .eq('id', context.orgId)
    .single();

  if (!organization) return billingRedirect(request, '?error=no-organization');

  const { count } = await context.supabase
    .from('org_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('org_id', context.orgId);

  const config = billingConfig();

  const url = await createCheckoutSession({
    secretKey: config.secretKey,
    priceId: config.prices.teamPriceId,
    orgId: context.orgId,
    plan: 'team',
    seats: Math.max(count ?? organization.seats, 1),
    customerId: organization.stripe_customer_id,
    customerEmail: context.email,
    successUrl: `${origin}${BILLING_PATH}?checkout=complete`,
    cancelUrl: `${origin}${BILLING_PATH}`,
  });

  return Response.redirect(url, 303);
}
