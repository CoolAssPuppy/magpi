import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/database.types';
import type { SessionContext } from '@/lib/supabase/context';

vi.mock('server-only', () => ({}));

const USER_ID = '77777777-7777-4777-8777-777777777777';
const ORG_ID = '11111111-1111-4111-8111-111111111111';

const adminCheck = {
  answer: null as unknown,
  error: null as { readonly message: string } | null,
  asked: [] as readonly unknown[][],
};

const sessionState = {
  context: null as SessionContext | null,
};

const serviceRole = {
  built: 0,
};

vi.mock('@/lib/supabase/context', () => ({
  getSessionContext: async () => sessionState.context,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    serviceRole.built += 1;
    return { tag: 'service-role' };
  },
}));

const { resolveAdminAccess } = await import('./access');

function member(overrides: Partial<SessionContext> = {}): SessionContext {
  const supabase = {
    rpc: async (name: string, args: unknown) => {
      adminCheck.asked = [...adminCheck.asked, [name, args]];
      return { data: adminCheck.answer, error: adminCheck.error };
    },
  } as unknown as SupabaseClient<Database>;

  return {
    userId: USER_ID,
    email: 'ada@example.com',
    orgId: ORG_ID,
    role: 'member',
    supabase,
    ...overrides,
  };
}

beforeEach(() => {
  adminCheck.answer = null;
  adminCheck.error = null;
  adminCheck.asked = [];
  sessionState.context = null;
  serviceRole.built = 0;
});

describe('deciding who may see the admin surface', () => {
  it('gives an admin the elevated client the org-wide panels need', async () => {
    sessionState.context = member({ role: 'admin' });
    adminCheck.answer = true;

    const access = await resolveAdminAccess();

    expect(access.kind).toBe('granted');
    if (access.kind !== 'granted') return;
    expect(access.context.orgId).toBe(ORG_ID);
    expect(access.elevated).toEqual({ tag: 'service-role' });
  });

  it('asks the database rather than trusting the role carried on the session', async () => {
    sessionState.context = member({ role: 'owner' });
    adminCheck.answer = false;

    const access = await resolveAdminAccess();

    expect(access.kind).toBe('forbidden');
  });

  it('asks only about the organization the caller is acting in', async () => {
    sessionState.context = member();
    adminCheck.answer = true;

    await resolveAdminAccess();

    expect(adminCheck.asked).toEqual([['is_org_admin', { p_org_id: ORG_ID }]]);
  });

  it('separates a signed-out visitor from a member who is not an admin', async () => {
    sessionState.context = null;

    expect(await resolveAdminAccess()).toEqual({ kind: 'signed-out' });
  });

  it('hands a refused member back their own session, so the page can name them', async () => {
    sessionState.context = member();
    adminCheck.answer = false;

    const access = await resolveAdminAccess();

    expect(access.kind).toBe('forbidden');
    if (access.kind !== 'forbidden') return;
    expect(access.context.userId).toBe(USER_ID);
  });

  it('never builds a service-role client for someone the database refused', async () => {
    sessionState.context = member();
    adminCheck.answer = false;

    await resolveAdminAccess();

    expect(serviceRole.built).toBe(0);
  });

  it('never builds a service-role client for a signed-out visitor', async () => {
    sessionState.context = null;

    await resolveAdminAccess();

    expect(serviceRole.built).toBe(0);
  });

  it('treats a null answer from the check as a refusal, not as an admin', async () => {
    sessionState.context = member();
    adminCheck.answer = null;

    const access = await resolveAdminAccess();

    expect(access.kind).toBe('forbidden');
  });

  it('fails loudly when the admin check itself fails, rather than reading the failure as a no', async () => {
    sessionState.context = member();
    adminCheck.error = { message: 'permission denied for function is_org_admin' };

    await expect(resolveAdminAccess()).rejects.toThrow(
      'permission denied for function is_org_admin',
    );
    expect(serviceRole.built).toBe(0);
  });
});
