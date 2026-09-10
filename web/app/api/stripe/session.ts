import 'server-only';

import { NextResponse } from 'next/server';

import { isOrgAdmin } from '@/lib/auth/admin';
import { getSessionContext, type SessionContext } from '@/lib/supabase/context';

export const BILLING_PATH = '/admin/billing';

/** Same-origin check for a route handler, which does not get one the way a server action does. */
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

  const admin = await isOrgAdmin(context.supabase, context.orgId);

  if (!admin.ok) {
    console.error('the admin check did not run', { orgId: context.orgId, error: admin.error });
    return { kind: 'refused', response: billingRedirect(request, '?error=check-failed') };
  }

  if (!admin.data) {
    return { kind: 'refused', response: billingRedirect(request, '?error=not-admin') };
  }

  return { kind: 'allowed', context, origin: new URL(request.url).origin };
}
