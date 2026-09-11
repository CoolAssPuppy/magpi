import { assertEquals, assertRejects } from '@std/assert';

import { ApiError } from './errors.ts';
import {
  type ConnectionRow,
  requireConnectionAccess,
  requireRoutableSpaces,
  routesOf,
} from './connections.ts';
import { stubDb, type StubRequest } from './testing/stub_db.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const OWNER = '22222222-2222-4222-8222-222222222222';
const OTHER_USER = '55555555-5555-4555-8555-555555555555';
const ENGINEERING = '33333333-3333-4333-8333-333333333333';
const FINANCE = '44444444-4444-4444-8444-444444444444';
const PRIVATE = '66666666-6666-4666-8666-666666666666';

function connection(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    id: 'connection-1',
    org_id: ORG,
    user_id: OWNER,
    provider: 'slack',
    external_account_id: 'acme.slack.com',
    access_token_enc: null,
    refresh_token_enc: null,
    scopes: [],
    scope_selection: { kind: 'channel', available: [], routes: { C1: ENGINEERING } },
    status: 'active',
    status_detail: null,
    cursor: null,
    token_expires_at: null,
    last_synced_at: null,
    ...overrides,
  };
}

/** One row of the fixture, as the two tables the guards read. */
interface SpaceRow {
  id: string;
  org_id: string;
  members: string[];
}

const SPACES: SpaceRow[] = [
  { id: ENGINEERING, org_id: ORG, members: [OWNER, OTHER_USER] },
  { id: FINANCE, org_id: ORG, members: [OWNER] },
  // Somebody else's org, so an org filter that goes missing shows up as an extra row.
  { id: PRIVATE, org_id: OTHER_ORG, members: [OWNER, OTHER_USER] },
];

/** `space_id=eq.abc` and `id=in.(a,b)` as the client actually writes them. */
function valuesFor(query: string, column: string): string[] | null {
  const eq = new RegExp(`(?:^|&)${column}=eq\\.([^&]+)`).exec(query);
  if (eq) return [eq[1]];

  const list = new RegExp(`(?:^|&)${column}=in\\.\\(([^)]*)\\)`).exec(query);
  if (list) return list[1].split(',').map((value) => value.replace(/^"|"$/g, ''));
  return null;
}

/**
 * Answers from the fixture with the filters the request carries actually applied. A stub that
 * ignores the query lets a guard pass its own tests with its filters deleted, which is the shape
 * docs/lessons.md records as F013. Removing a filter here changes the answer.
 */
function spaceReply(request: StubRequest): { body: unknown } | undefined {
  if (request.table !== 'spaces' && request.table !== 'space_members') return undefined;

  const orgs = valuesFor(request.query, 'org_id');
  const users = valuesFor(request.query, 'space_members.user_id') ??
    valuesFor(request.query, 'user_id');
  const ids = valuesFor(request.query, 'id') ?? valuesFor(request.query, 'space_id');

  const matched = SPACES.filter((space) =>
    (orgs === null || orgs.includes(space.org_id)) &&
    (users === null || space.members.some((member) => users.includes(member))) &&
    (ids === null || ids.includes(space.id))
  );

  // requireConnectionAccess reads space_members and wants space_id back.
  if (request.table === 'space_members') {
    return { body: matched.map((space) => ({ space_id: space.id })) };
  }
  return { body: matched.map((space) => ({ id: space.id })) };
}

Deno.test('a column the picker never populated routes nothing anywhere', () => {
  assertEquals(routesOf(connection({ scope_selection: {} })), {});
});

Deno.test('a route with no destination is dropped rather than read as a space', () => {
  const row = connection({
    scope_selection: { routes: { C1: ENGINEERING, C2: '', C3: null, C4: 7 } },
  });
  assertEquals(routesOf(row), { C1: ENGINEERING });
});

Deno.test('one account can send two units to two spaces', () => {
  const row = connection({ scope_selection: { routes: { C1: ENGINEERING, C2: FINANCE } } });
  assertEquals(Object.keys(routesOf(row)).sort(), ['C1', 'C2']);
  assertEquals(routesOf(row).C2, FINANCE);
});

Deno.test('the person who connected an account reaches it before it routes anywhere', async () => {
  const stub = stubDb(spaceReply);
  try {
    await requireConnectionAccess(stub.db, OWNER, connection({ scope_selection: {} }));
  } finally {
    await stub.close();
  }
});

Deno.test('somebody else cannot reach a connection that routes nowhere', async () => {
  const stub = stubDb(spaceReply);
  try {
    const error = await assertRejects(
      () => requireConnectionAccess(stub.db, OTHER_USER, connection({ scope_selection: {} })),
      ApiError,
    );
    assertEquals(error.status, 404);
  } finally {
    await stub.close();
  }
});

Deno.test('sharing one destination is enough to reach a connection', async () => {
  const stub = stubDb(spaceReply);
  try {
    // OTHER_USER is in Engineering, which is where this connection sends C1.
    await requireConnectionAccess(stub.db, OTHER_USER, connection());
  } finally {
    await stub.close();
  }
});

Deno.test('sharing no destination keeps a connection out of reach', async () => {
  const stub = stubDb(spaceReply);
  try {
    // Finance is the only destination, and OTHER_USER is not in it.
    const error = await assertRejects(
      () =>
        requireConnectionAccess(
          stub.db,
          OTHER_USER,
          connection({ scope_selection: { routes: { C1: FINANCE } } }),
        ),
      ApiError,
    );
    assertEquals(error.status, 404);
  } finally {
    await stub.close();
  }
});

Deno.test('a destination in another organization is refused', async () => {
  const stub = stubDb(spaceReply);
  try {
    const error = await assertRejects(
      () =>
        requireRoutableSpaces(
          stub.db,
          OWNER,
          connection({ scope_selection: { routes: { C1: ENGINEERING, C2: PRIVATE } } }),
          { C1: ENGINEERING, C2: PRIVATE },
        ),
      ApiError,
    );
    assertEquals(error.status, 404);
    assertEquals(error.code, 'unknown_space');
  } finally {
    await stub.close();
  }
});

Deno.test('the owner routing into a space they are not in is refused', async () => {
  const stub = stubDb(spaceReply);
  try {
    // OTHER_USER owns this one and is not in Finance, so Finance is not theirs to route to.
    const error = await assertRejects(
      () =>
        requireRoutableSpaces(
          stub.db,
          OTHER_USER,
          connection({ user_id: OTHER_USER, scope_selection: { routes: { C1: FINANCE } } }),
          { C1: FINANCE },
        ),
      ApiError,
    );
    assertEquals(error.status, 404);
  } finally {
    await stub.close();
  }
});

Deno.test('the owner may send their account to any space they are in', async () => {
  const stub = stubDb(spaceReply);
  try {
    await requireRoutableSpaces(stub.db, OWNER, connection(), {
      C1: ENGINEERING,
      C2: FINANCE,
    });
  } finally {
    await stub.close();
  }
});

// Somebody who shares one destination must not be able to tap the rest of the account.
Deno.test('a non-owner cannot send a connection somewhere it does not already go', async () => {
  const stub = stubDb(spaceReply);
  try {
    const error = await assertRejects(
      () =>
        requireRoutableSpaces(stub.db, OTHER_USER, connection(), {
          C1: ENGINEERING,
          C2: PRIVATE,
        }),
      ApiError,
    );
    assertEquals(error.status, 403);
    assertEquals(error.code, 'not_your_connection');
  } finally {
    await stub.close();
  }
});

Deno.test('a non-owner may move a unit between destinations it already has', async () => {
  const stub = stubDb(spaceReply);
  try {
    const row = connection({
      scope_selection: { routes: { C1: ENGINEERING, C2: ENGINEERING } },
    });
    await requireRoutableSpaces(stub.db, OTHER_USER, row, { C1: ENGINEERING });
  } finally {
    await stub.close();
  }
});

Deno.test('routing nothing asks the database nothing', async () => {
  const stub = stubDb(spaceReply);
  try {
    await requireRoutableSpaces(stub.db, OWNER, connection(), {});
    assertEquals(stub.requests.length, 0);
  } finally {
    await stub.close();
  }
});

Deno.test('the org filter is the connection org, not one the caller chose', async () => {
  const stub = stubDb(spaceReply);
  try {
    // PRIVATE sits in OTHER_ORG and the caller is in it, so only the org filter refuses this.
    await assertRejects(
      () =>
        requireRoutableSpaces(
          stub.db,
          OWNER,
          connection({ scope_selection: { routes: { C1: PRIVATE } } }),
          { C1: PRIVATE },
        ),
      ApiError,
    );
    const asked = stub.requests.find((request) => request.table === 'spaces');
    assertEquals(asked?.query.includes(ORG), true);
  } finally {
    await stub.close();
  }
});
