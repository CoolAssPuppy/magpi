import { assert, assertEquals, assertRejects } from "@std/assert";

import { claimConnection, type ClaimPort, type PendingConnection } from "./claim.ts";
import { ApiError } from "./errors.ts";

const ATTACKER = "user-attacker";
const VICTIM = "user-victim";

function pendingFor(userId: string, overrides: Partial<PendingConnection> = {}): PendingConnection {
  return {
    userId,
    provider: "github",
    externalAccount: "octocat",
    accessTokenEnc: "\\xdeadbeef",
    refreshTokenEnc: null,
    scopes: ["read:user"],
    tokenExpiresAt: null,
    returnTo: null,
    ...overrides,
  };
}

function makePort(pending: PendingConnection | null, overrides: Partial<ClaimPort> = {}) {
  const stored: PendingConnection[] = [];
  const audits: Record<string, unknown>[] = [];
  const consumed: string[] = [];

  const port: ClaimPort = {
    consumePending: (ticket) => {
      consumed.push(ticket);
      return Promise.resolve(pending);
    },
    storeConnection: (input) => {
      stored.push(input);
      return Promise.resolve();
    },
    audit: (entry) => {
      audits.push(entry);
    },
    ...overrides,
  };
  return { port, stored, audits, consumed };
}

Deno.test("the account that started the flow gets the connection", async () => {
  const { port, stored, audits } = makePort(pendingFor(VICTIM));

  const result = await claimConnection(port, VICTIM, "ticket-1");

  assertEquals(result.provider, "github");
  assertEquals(stored.length, 1);
  assertEquals(stored[0].userId, VICTIM);
  assertEquals(audits.length, 1);
  assertEquals(audits[0].action, "conn.link");
});

// The vulnerability this whole path exists to close. An attacker starts a flow
// on their own account and sends the authorize link to someone else. The
// provider exchange succeeds, because it is a genuine authorization by a
// genuine user. What must not happen is the victim's token landing on the
// attacker's row.
Deno.test("a token claimed by an account that did not start the flow is discarded", async () => {
  const { port, stored } = makePort(pendingFor(ATTACKER));

  const error = await assertRejects(
    () => claimConnection(port, VICTIM, "attacker-ticket"),
    ApiError,
  );

  assertEquals(error.status, 403);
  assertEquals(error.code, "claim_mismatch");
  assertEquals(stored.length, 0, "no connection may be written on a mismatched claim");
});

Deno.test("a mismatched claim is audited against the account under attack", async () => {
  const { port, audits } = makePort(pendingFor(ATTACKER));

  await assertRejects(() => claimConnection(port, VICTIM, "attacker-ticket"), ApiError);

  assertEquals(audits.length, 1);
  assertEquals(audits[0].action, "conn.claim_rejected");
  assertEquals(audits[0].actor, `user:${VICTIM}`);
  // The attacker's account is the one that would have received the token.
  assertEquals((audits[0].meta as Record<string, unknown>).intended_user, ATTACKER);
});

Deno.test("a refused claim consumes the ticket before it refuses", async () => {
  // Ordering, not the fact of consumption: claimConnection has no other source
  // of `pending`, so asserting it called consumePending could not fail. What
  // matters is that nothing is left behind for a second attempt, so the
  // consume must have happened by the time the mismatch throws.
  const { port, consumed, stored } = makePort(pendingFor(ATTACKER));

  await assertRejects(() => claimConnection(port, VICTIM, "attacker-ticket"), ApiError);

  assertEquals(consumed, ["attacker-ticket"]);
  assertEquals(stored.length, 0);
  // Single use itself is enforced by the delete-and-return in
  // consume_pending_connection, asserted in rls.test.sql.
});

Deno.test("an unknown, expired, or already claimed ticket is one answer", async () => {
  const { port, stored, audits } = makePort(null);

  const error = await assertRejects(() => claimConnection(port, VICTIM, "stale"), ApiError);

  assertEquals(error.status, 410);
  assertEquals(error.code, "claim_expired");
  assertEquals(stored.length, 0);
  assertEquals(audits.length, 0);
});

Deno.test("the ciphertext moves across untouched", async () => {
  // The AAD binds it to userId, which a successful claim does not change, so
  // nothing decrypts on this path.
  const pending = pendingFor(VICTIM, {
    accessTokenEnc: "\\x0101",
    refreshTokenEnc: "\\x0202",
    scopes: ["read:user", "repo"],
    tokenExpiresAt: "2026-08-01T00:00:00Z",
  });
  const { port, stored } = makePort(pending);

  await claimConnection(port, VICTIM, "ticket-1");

  assertEquals(stored[0].accessTokenEnc, "\\x0101");
  assertEquals(stored[0].refreshTokenEnc, "\\x0202");
  assertEquals(stored[0].scopes, ["read:user", "repo"]);
  assertEquals(stored[0].tokenExpiresAt, "2026-08-01T00:00:00Z");
});

Deno.test("a return_to survives the round trip", async () => {
  const { port } = makePort(pendingFor(VICTIM, { returnTo: "/connections/github" }));

  const result = await claimConnection(port, VICTIM, "ticket-1");

  assertEquals(result.returnTo, "/connections/github");
});

Deno.test("a store failure does not report a connection", async () => {
  const { port, audits } = makePort(pendingFor(VICTIM), {
    storeConnection: () => Promise.reject(new Error("upsert failed")),
  });

  await assertRejects(() => claimConnection(port, VICTIM, "ticket-1"), Error);

  assert(
    !audits.some((entry) => entry.action === "conn.link"),
    "conn.link must not be written when the connection was not stored",
  );
});
