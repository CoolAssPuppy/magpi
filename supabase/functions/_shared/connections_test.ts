import { assertEquals, assertRejects } from '@std/assert';

import { ApiError } from './errors.ts';
import {
  type ConnectionRow,
  requireConnectionAccess,
  requireRoutableSpaces,
  routedUnitIds,
  routesOf,
} from './connections.ts';
import { stubDb } from './testing/stub_db.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const OWNER = '22222222-2222-4222-8222-222222222222';
const OTHER_USER = '55555555-5555-4555-8555-555555555555';
const ENGINEERING = '33333333-3333-4333-8333-333333333333';
const FINANCE = '44444444-4444-4444-8444-444444444444';

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

Deno.test('a column the picker never populated routes nothing anywhere', () => {
  assertEquals(routesOf(connection({ scope_selection: {} })), {});
  assertEquals(routedUnitIds(connection({ scope_selection: {} })), []);
});

Deno.test('a route with no destination is dropped rather than read as a space', () => {
  const row = connection({
    scope_selection: { routes: { C1: ENGINEERING, C2: '', C3: null, C4: 7 } },
  });
  assertEquals(routesOf(row), { C1: ENGINEERING });
});

Deno.test('one account can send two units to two spaces', () => {
  const row = connection({ scope_selection: { routes: { C1: ENGINEERING, C2: FINANCE } } });
  assertEquals(routedUnitIds(row).sort(), ['C1', 'C2']);
  assertEquals(routesOf(row).C2, FINANCE);
});

Deno.test('the person who connected an account reaches it before it routes anywhere', async () => {
  const stub = stubDb(() => ({ body: [] }));
  try {
    await requireConnectionAccess(stub.db, OWNER, connection({ scope_selection: {} }));
  } finally {
    await stub.close();
  }
});

Deno.test('somebody else cannot reach a connection that routes nowhere', async () => {
  const stub = stubDb(() => ({ body: [] }));
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
  const stub = stubDb(() => ({ body: [{ space_id: ENGINEERING }] }));
  try {
    await requireConnectionAccess(stub.db, OTHER_USER, connection());
  } finally {
    await stub.close();
  }
});

Deno.test('a destination that is not a space in this org is refused', async () => {
  // The stub answers with nothing, which is what the org filter does for another org's space.
  const stub = stubDb(() => ({ body: [] }));
  try {
    const error = await assertRejects(
      () => requireRoutableSpaces(stub.db, OWNER, ORG, { C1: FINANCE }),
      ApiError,
    );
    assertEquals(error.status, 404);
    // Out of org and not a member read the same, so neither can be probed.
    assertEquals(error.code, 'unknown_space');
  } finally {
    await stub.close();
  }
});

Deno.test('routing into a space the caller is not in is refused, not silently stored', async () => {
  // Engineering comes back because the caller is in it. Finance does not.
  const stub = stubDb(() => ({ body: [{ id: ENGINEERING }] }));
  try {
    await assertRejects(
      () => requireRoutableSpaces(stub.db, OWNER, ORG, { C1: ENGINEERING, C2: FINANCE }),
      ApiError,
    );
  } finally {
    await stub.close();
  }
});

Deno.test('every destination the caller is in is accepted', async () => {
  const stub = stubDb(() => ({ body: [{ id: ENGINEERING }, { id: FINANCE }] }));
  try {
    await requireRoutableSpaces(stub.db, OWNER, ORG, { C1: ENGINEERING, C2: FINANCE });
  } finally {
    await stub.close();
  }
});

Deno.test('routing nothing asks the database nothing', async () => {
  const stub = stubDb(() => ({ body: [] }));
  try {
    await requireRoutableSpaces(stub.db, OWNER, ORG, {});
    assertEquals(stub.requests.length, 0);
  } finally {
    await stub.close();
  }
});

Deno.test('the org filter is the connection org, not one the caller chose', async () => {
  const stub = stubDb(() => ({ body: [{ id: ENGINEERING }] }));
  try {
    await requireRoutableSpaces(stub.db, OWNER, OTHER_ORG, { C1: ENGINEERING });
    const asked = stub.requests.find((request) => request.table === 'spaces');
    assertEquals(asked?.query.includes(OTHER_ORG), true);
  } finally {
    await stub.close();
  }
});
