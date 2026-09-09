import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/database.types';

vi.mock('server-only', () => ({}));

/**
 * React's cache() only memoizes inside a server request, and the react build
 * vitest loads is the client one, where it is a pass-through. This stands in for
 * the request scope a page render provides, and the scope id is what makes one
 * test's request end before the next one begins.
 */
const cacheScope = vi.hoisted(() => ({ id: 0 }));

vi.mock('react', () => ({
  cache: <Args extends unknown[], Result>(fn: (...args: Args) => Result) => {
    let memo: { readonly id: number; readonly value: Result } | null = null;

    return (...args: Args): Result => {
      if (memo && memo.id === cacheScope.id) return memo.value;
      const value = fn(...args);
      memo = { id: cacheScope.id, value };
      return value;
    };
  },
}));

const USER_ID = '77777777-7777-4777-8777-777777777777';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';

type AuthUser = { readonly id: string; readonly email?: string };

type MembershipRow = {
  readonly org_id: string;
  readonly role: Database['public']['Enums']['org_role'];
};

type Account = {
  readonly user: AuthUser | null;
  readonly membership: MembershipRow | null;
};

type RecordedCall = readonly [string, ...unknown[]];

const clientState = {
  chain: [] as RecordedCall[],
  client: null as SupabaseClient<Database> | null,
  accountReads: 0,
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => clientState.client,
}));

const { getSessionContext } = await import('./context');

function account(overrides: Partial<Account> = {}): Account {
  return {
    user: { id: USER_ID, email: 'ada@example.com' },
    membership: { org_id: ORG_ID, role: 'member' },
    ...overrides,
  };
}

/**
 * A postgrest builder that records the chain instead of talking to a database.
 * The cast is confined to this factory: it is the one place a test double has to
 * stand in for a client whose full surface it does not implement.
 */
function signedInAs(reader: Account): SupabaseClient<Database> {
  const chain: RecordedCall[] = [];
  clientState.chain = chain;

  const builder: Record<string, unknown> = {
    maybeSingle: () => Promise.resolve({ data: reader.membership, error: null }),
  };

  for (const method of ['select', 'eq', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      chain.push([method, ...args]);
      return builder;
    };
  }

  const client = {
    auth: {
      getUser: async () => {
        clientState.accountReads += 1;
        return { data: { user: reader.user }, error: null };
      },
    },
    from: (table: string) => {
      chain.push(['from', table]);
      return builder;
    },
  } as unknown as SupabaseClient<Database>;

  clientState.client = client;
  return client;
}

beforeEach(() => {
  clientState.chain = [];
  clientState.client = null;
  clientState.accountReads = 0;
  cacheScope.id += 1;
});

describe('resolving the caller and the organization they are acting in', () => {
  it('answers with the organization and the role the signed-in reader holds in it', async () => {
    signedInAs(account({ membership: { org_id: ORG_ID, role: 'admin' } }));

    const context = await getSessionContext();

    expect(context).toMatchObject({
      userId: USER_ID,
      email: 'ada@example.com',
      orgId: ORG_ID,
      role: 'admin',
    });
  });

  it('hands back the request-scoped client, so what the caller queries next runs as them', async () => {
    const client = signedInAs(account());

    const context = await getSessionContext();

    expect(context?.supabase).toBe(client);
  });

  it('reports an account with no address of its own as having no email', async () => {
    signedInAs(account({ user: { id: USER_ID } }));

    const context = await getSessionContext();

    expect(context?.email).toBeNull();
  });

  it('picks the earliest membership, so someone in two organizations lands in the same one every time', async () => {
    signedInAs(account({ membership: { org_id: OTHER_ORG_ID, role: 'member' } }));

    const context = await getSessionContext();

    expect(context?.orgId).toBe(OTHER_ORG_ID);
    expect(clientState.chain).toEqual([
      ['from', 'org_members'],
      ['select', 'org_id, role'],
      ['eq', 'user_id', USER_ID],
      ['order', 'created_at', { ascending: true }],
      ['limit', 1],
    ]);
  });

  it('reads the account once when one page render resolves the session more than once', async () => {
    signedInAs(account());

    const [first, second] = await Promise.all([getSessionContext(), getSessionContext()]);

    expect(second).toBe(first);
    expect(clientState.accountReads).toBe(1);
    expect(clientState.chain.filter(([method]) => method === 'from')).toEqual([
      ['from', 'org_members'],
    ]);
  });

  it('answers null for a visitor who is not signed in, which is an ordinary outcome here', async () => {
    signedInAs(account({ user: null }));

    expect(await getSessionContext()).toBeNull();
  });

  it('answers null for a signed-in account that belongs to no organization', async () => {
    signedInAs(account({ membership: null }));

    expect(await getSessionContext()).toBeNull();
  });

  it('does not go looking for a membership when nobody is signed in', async () => {
    signedInAs(account({ user: null }));

    await getSessionContext();

    expect(clientState.chain).toEqual([]);
  });
});
