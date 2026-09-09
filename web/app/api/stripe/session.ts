import 'server-only';

import { NextResponse } from 'next/server';

import { getSessionContext, type SessionContext } from '@/lib/supabase/context';

export const BILLING_PATH = '/admin/billing';

/**
 * Same-origin check for a route handler that starts a paid flow.
 *
 * Server actions get this for free. A route handler does not, and without it any
 * page on the internet could post a form at this endpoint using the reader's
 * cookies.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  const host = request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type BillingCaller =
  | { readonly kind: 'allowed'; readonly context: SessionContext; readonly origin: string }
  | { readonly kind: 'refused'; readonly response: NextResponse };

export function billingRedirect(request: Request, query: string): NextResponse {
  return NextResponse.redirect(new URL(`${BILLING_PATH}${query}`, request.url), 303);
}

/** Resolves the caller and confirms with the database that they may change the plan. */
export async function resolveBillingCaller(request: Request): Promise<BillingCaller> {
  if (!isSameOrigin(request)) {
    return {
      kind: 'refused',
      response: NextResponse.json({ error: 'bad origin' }, { status: 403 }),
    };
  }

  const context = await getSessionContext();
  if (!context) {
    return { kind: 'refused', response: billingRedirect(request, '?error=signed-out') };
  }

  const { data: isAdmin } = await context.supabase.rpc('is_org_admin', {
    p_org_id: context.orgId,
  });

  if (isAdmin !== true) {
    return { kind: 'refused', response: billingRedirect(request, '?error=not-admin') };
  }

  return { kind: 'allowed', context, origin: new URL(request.url).origin };
}
