import { billingConfig } from '@/lib/billing/config';
import { createPortalSession } from '@/lib/billing/stripe-api';

import { BILLING_PATH, billingRedirect, resolveBillingCaller } from '../session';

export const runtime = 'nodejs';

/** Cards, invoices, seats and cancellation all live in the Stripe portal. */
export async function POST(request: Request): Promise<Response> {
  const caller = await resolveBillingCaller(request);
  if (caller.kind === 'refused') return caller.response;

  const { context, origin } = caller;

  const { data: organization } = await context.supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', context.orgId)
    .single();

  if (!organization?.stripe_customer_id) return billingRedirect(request, '?error=no-customer');

  const config = billingConfig();

  const url = await createPortalSession({
    secretKey: config.secretKey,
    customerId: organization.stripe_customer_id,
    returnUrl: `${origin}${BILLING_PATH}`,
  });

  return Response.redirect(url, 303);
}
