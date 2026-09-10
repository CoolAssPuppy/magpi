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

Deno.test('a user in two orgs gets the oldest one every time', async () => {
  // Nothing in the connect flow names an org, so the answer has to be stable.
  const stub = stubDb((request: StubRequest) =>
    request.table === 'org_members' ? { body: { org_id: ORG } } : undefined
  );

  try {
    await requireOrgMembership(stub.db, USER);
    const query = stub.requests[0].query;
    assertEquals(query.includes('order=created_at.asc,org_id.asc'), true);
    assertEquals(query.includes('limit=1'), true);
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
