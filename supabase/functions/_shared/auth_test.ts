import { assertEquals } from '@std/assert';

import { requireOrgMembership } from './auth.ts';
import { asyncApiErrorFrom } from './testing/assertions.ts';
import { stubDb, type StubRequest } from './testing/stub_db.ts';

const ORG = '44444444-4444-4444-8444-444444444444';
const USER = '11111111-1111-4111-8111-111111111111';

Deno.test('the caller org is read from their membership', async () => {
  const stub = stubDb((request: StubRequest) =>
    request.table === 'org_members' ? { body: { org_id: ORG } } : undefined
  );

  try {
    const { orgId } = await requireOrgMembership(stub.db, USER);
    assertEquals(orgId, ORG);
    assertEquals(stub.requests[0].query.includes(`user_id=eq.${USER}`), true);
  } finally {
    await stub.close();
  }
});

Deno.test('the membership is read as the one it is, not the first of several', async () => {
  // org_members_user_id_idx is unique on the user, so there is nothing to order or limit. Asking
  // for one of many would hide a second membership that should be impossible.
  const stub = stubDb((request: StubRequest) =>
    request.table === 'org_members' ? { body: { org_id: ORG } } : undefined
  );

  try {
    await requireOrgMembership(stub.db, USER);
    const query = stub.requests[0].query;
    assertEquals(query.includes('order='), false);
    assertEquals(query.includes('limit='), false);
  } finally {
    await stub.close();
  }
});

Deno.test('a second membership is a fault rather than a choice to make', async () => {
  // maybeSingle raises on more than one row, which is what the unique index promises cannot happen.
  const stub = stubDb((request: StubRequest) =>
    request.table === 'org_members'
      ? { body: { message: 'multiple rows returned', code: 'PGRST116' }, status: 406 }
      : undefined
  );

  try {
    const err = await asyncApiErrorFrom(() => requireOrgMembership(stub.db, USER));
    assertEquals(err.status, 500);
  } finally {
    await stub.close();
  }
});

Deno.test('a user who belongs to no org is refused', async () => {
  const stub = stubDb((request: StubRequest) =>
    request.table === 'org_members' ? { body: null } : undefined
  );

  try {
    const err = await asyncApiErrorFrom(() => requireOrgMembership(stub.db, USER));
    assertEquals(err.status, 403);
    assertEquals(err.code, 'no_org');
  } finally {
    await stub.close();
  }
});
