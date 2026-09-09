import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutRequest, PortalRequest } from '@/lib/billing/stripe-api';
import type { Database } from '@/lib/database.types';
import type { SessionContext } from '@/lib/supabase/context';

vi.mock('server-only', () => ({}));

const APP_ORIGIN = 'https://recall.test';
const APP_HOST = 'recall.test';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '77777777-7777-4777-8777-777777777777';
const CHECKOUT_URL = 'https://checkout.stripe.test/c/session_1';
const PORTAL_URL = 'https://billing.stripe.test/p/session_1';

const sessionState = {
  context: null as SessionContext | null,
};

const stripe = {
  checkouts: [] as CheckoutRequest[],
  portals: [] as PortalRequest[],
};

vi.mock('@/lib/supabase/context', () => ({
  getSessionContext: async () => sessionState.context,
}));

vi.mock('@/lib/billing/stripe-api', () => ({
  createCheckoutSession: async (request: CheckoutRequest) => {
    stripe.checkouts.push(request);
    return CHECKOUT_URL;
  },
  createPortalSession: async (request: PortalRequest) => {
    stripe.portals.push(request);
    return PORTAL_URL;
  },
}));

const { POST: startCheckout } = await import('./checkout/route');
const { POST: openPortal } = await import('./portal/route');

type OrganizationRow = {
  readonly stripe_customer_id: string | null;
  readonly seats: number;
};

type Team = {
  readonly isAdmin: boolean;
  readonly organization: OrganizationRow | null;
  readonly memberCount: number | null;
};

type RecordedRead = readonly [string, string, unknown];

const reads: RecordedRead[] = [];

function team(overrides: Partial<Team> = {}): Team {
  return {
    isAdmin: true,
    organization: { stripe_customer_id: null, seats: 3 },
    memberCount: 5,
    ...overrides,
  };
}

/**
 * The two tables these routes read, as row level security leaves them for one
 * admin. The cast is confined to this factory, which stands in for a client
 * whose full surface it does not implement.
 */
function callerFor(state: Team): SessionContext {
  const supabase = {
    rpc: async () => ({ data: state.isAdmin, error: null }),
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          reads.push([table, column, value]);
          if (table === 'organizations') {
            return { single: async () => ({ data: state.organization, error: null }) };
          }
          return Promise.resolve({ count: state.memberCount, error: null });
        },
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  return {
    userId: USER_ID,
    email: 'ada@example.com',
    orgId: ORG_ID,
    role: 'admin',
    supabase,
  };
}

function post(path: string, headers: Record<string, string>): Request {
  return new Request(`${APP_ORIGIN}${path}`, { method: 'POST', headers });
}

function fromTheApp(path: string): Request {
  return post(path, { origin: APP_ORIGIN, host: APP_HOST });
}

beforeEach(() => {
  process.env.SB_STRIPE_SECRET_KEY = 'sk_test_1';
  process.env.SB_STRIPE_PRICE_TEAM = 'price_team_1';
  sessionState.context = callerFor(team());
  stripe.checkouts = [];
  stripe.portals = [];
  reads.length = 0;
});

afterEach(() => {
  delete process.env.SB_STRIPE_SECRET_KEY;
  delete process.env.SB_STRIPE_PRICE_TEAM;
});

describe('who is allowed to start a paid flow', () => {
  it('refuses a checkout started from another site with the reader cookies', async () => {
    const response = await startCheckout(
      post('/api/stripe/checkout', { origin: 'https://evil.test', host: APP_HOST }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'bad origin' });
    expect(stripe.checkouts).toEqual([]);
  });

  it('refuses a checkout that arrives with no Origin header at all', async () => {
    const response = await startCheckout(post('/api/stripe/checkout', { host: APP_HOST }));

    expect(response.status).toBe(403);
    expect(stripe.checkouts).toEqual([]);
  });

  it('refuses an Origin that is not a URL', async () => {
    const response = await startCheckout(
      post('/api/stripe/checkout', { origin: 'null', host: APP_HOST }),
    );

    expect(response.status).toBe(403);
    expect(stripe.checkouts).toEqual([]);
  });

  it('refuses a portal request from another site too', async () => {
    const response = await openPortal(
      post('/api/stripe/portal', { origin: 'https://evil.test', host: APP_HOST }),
    );

    expect(response.status).toBe(403);
    expect(stripe.portals).toEqual([]);
  });

  it('sends a signed-out caller back to billing to sign in', async () => {
    sessionState.context = null;

    const response = await startCheckout(fromTheApp('/api/stripe/checkout'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/admin/billing?error=signed-out`);
    expect(stripe.checkouts).toEqual([]);
  });

  it('sends a member who is not an admin back to billing rather than to Stripe', async () => {
    sessionState.context = callerFor(team({ isAdmin: false }));

    const response = await startCheckout(fromTheApp('/api/stripe/checkout'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/admin/billing?error=not-admin`);
    expect(stripe.checkouts).toEqual([]);
  });

  it('refuses a member who is not an admin the billing portal as well', async () => {
    sessionState.context = callerFor(team({ isAdmin: false }));

    const response = await openPortal(fromTheApp('/api/stripe/portal'));

    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/admin/billing?error=not-admin`);
    expect(stripe.portals).toEqual([]);
  });

  it('sends a signed-out caller away from the portal too', async () => {
    sessionState.context = null;

    const response = await openPortal(fromTheApp('/api/stripe/portal'));

    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/admin/billing?error=signed-out`);
    expect(stripe.portals).toEqual([]);
  });
});

describe('starting a checkout', () => {
  it('hands the browser to Stripe with a seat for every member of the team', async () => {
    const response = await startCheckout(fromTheApp('/api/stripe/checkout'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(CHECKOUT_URL);
    expect(stripe.checkouts).toEqual([
      {
        secretKey: 'sk_test_1',
        priceId: 'price_team_1',
        orgId: ORG_ID,
        plan: 'team',
        seats: 5,
        customerId: null,
        customerEmail: 'ada@example.com',
        successUrl: `${APP_ORIGIN}/admin/billing?checkout=complete`,
        cancelUrl: `${APP_ORIGIN}/admin/billing`,
      },
    ]);
  });

  it('counts seats and reads the plan for the caller own organization only', async () => {
    await startCheckout(fromTheApp('/api/stripe/checkout'));

    expect(reads).toEqual([
      ['organizations', 'id', ORG_ID],
      ['org_members', 'org_id', ORG_ID],
    ]);
  });

  it('falls back to the seats the organization already pays for when the count is unavailable', async () => {
    sessionState.context = callerFor(
      team({ memberCount: null, organization: { stripe_customer_id: null, seats: 7 } }),
    );

    await startCheckout(fromTheApp('/api/stripe/checkout'));

    expect(stripe.checkouts[0].seats).toBe(7);
  });

  it('never asks Stripe for fewer than one seat', async () => {
    sessionState.context = callerFor(
      team({ memberCount: 0, organization: { stripe_customer_id: null, seats: 0 } }),
    );

    await startCheckout(fromTheApp('/api/stripe/checkout'));

    expect(stripe.checkouts[0].seats).toBe(1);
  });

  it('reuses the Stripe customer the organization already has rather than making a second one', async () => {
    sessionState.context = callerFor(
      team({ organization: { stripe_customer_id: 'cus_existing', seats: 3 } }),
    );

    await startCheckout(fromTheApp('/api/stripe/checkout'));

    expect(stripe.checkouts[0].customerId).toBe('cus_existing');
  });

  it('sends the admin back rather than starting a checkout for an organization that is not there', async () => {
    sessionState.context = callerFor(team({ organization: null }));

    const response = await startCheckout(fromTheApp('/api/stripe/checkout'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `${APP_ORIGIN}/admin/billing?error=no-organization`,
    );
    expect(stripe.checkouts).toEqual([]);
  });
});

describe('opening the billing portal', () => {
  it('sends a paying admin to Stripe and brings them back to billing afterwards', async () => {
    sessionState.context = callerFor(
      team({ organization: { stripe_customer_id: 'cus_existing', seats: 3 } }),
    );

    const response = await openPortal(fromTheApp('/api/stripe/portal'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(PORTAL_URL);
    expect(stripe.portals).toEqual([
      {
        secretKey: 'sk_test_1',
        customerId: 'cus_existing',
        returnUrl: `${APP_ORIGIN}/admin/billing`,
      },
    ]);
  });

  it('reads the customer from the caller own organization only', async () => {
    sessionState.context = callerFor(
      team({ organization: { stripe_customer_id: 'cus_existing', seats: 3 } }),
    );

    await openPortal(fromTheApp('/api/stripe/portal'));

    expect(reads).toEqual([['organizations', 'id', ORG_ID]]);
  });

  it('sends the admin back when the organization has never paid, so there is nothing to manage', async () => {
    const response = await openPortal(fromTheApp('/api/stripe/portal'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/admin/billing?error=no-customer`);
    expect(stripe.portals).toEqual([]);
  });

  it('sends the admin back when there is no organization row at all', async () => {
    sessionState.context = callerFor(team({ organization: null }));

    const response = await openPortal(fromTheApp('/api/stripe/portal'));

    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/admin/billing?error=no-customer`);
    expect(stripe.portals).toEqual([]);
  });
});
