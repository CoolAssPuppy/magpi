import { assert, assertEquals, assertRejects } from "@std/assert";
import { ApiError } from "./errors.ts";
import { sha256Bytea } from "./crypto.ts";
import {
  approveDeviceAuth,
  buildVerificationUrls,
  DEFAULT_POLL_INTERVAL_SECONDS,
  type DeviceCodeRow,
  MAX_FAILED_LOOKUPS,
  type PairingPort,
  pollDeviceAuth,
  previewDeviceAuth,
  shortBadgeId,
  startDeviceAuth,
  SLOW_DOWN_INCREMENT_SECONDS,
} from "./pairing.ts";

const WEB = "https://magpi.example.com";
const T0 = new Date("2026-07-20T10:00:00Z");

/** In-memory port. Mirrors the real constraints, not just the happy path. */
function makePort(overrides: { now?: Date } = {}) {
  const rows: DeviceCodeRow[] = [];
  const hashes = new Map<string, string>(); // device_code_hash -> row id
  const badges: { id: string; user_id: string; badge_uid: string; revoked_at: string | null }[] =
    [];
  let clock = overrides.now ?? T0;
  let seq = 0;

  const port: PairingPort = {
    now: () => clock,
    insertDeviceCode: (row) => {
      const id = `da-${++seq}`;
      rows.push({
        id,
        user_code: row.user_code,
        status: "pending",
        user_id: null,
        badge_id: null,
        badge_uid: row.badge_uid,
        poll_interval_s: row.poll_interval_s,
        poll_count: 0,
        failed_lookups: 0,
        last_poll_at: null,
        created_at: clock.toISOString(),
        expires_at: row.expires_at,
      });
      hashes.set(row.device_code_hash, id);
      return Promise.resolve();
    },
    findByDeviceCodeHash: (hash) => {
      const id = hashes.get(hash);
      return Promise.resolve(rows.find((r) => r.id === id) ?? null);
    },
    findByUserCode: (code) => Promise.resolve(rows.find((r) => r.user_code === code) ?? null),
    updateDeviceCode: (id, patch) => {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
      return Promise.resolve();
    },
    upsertBadge: (input) => {
      // Faithful to pgPairingPort: owner-only revoke, then insert. A uid held
      // by another account is left active, and the single-active index makes
      // the insert fail (23505 -> badge_taken) rather than displacing it.
      const otherOwner = badges.find(
        (b) =>
          b.badge_uid === input.badge_uid && b.revoked_at === null && b.user_id !== input.user_id,
      );
      if (otherOwner) {
        return Promise.reject(
          new ApiError(409, "badge_taken", "this badge is linked to another account"),
        );
      }
      for (const b of badges) {
        if (b.badge_uid === input.badge_uid && b.revoked_at === null) {
          b.revoked_at = clock.toISOString();
        }
      }
      const badge = {
        id: `badge-${badges.length + 1}`,
        user_id: input.user_id,
        badge_uid: input.badge_uid,
        revoked_at: null,
      };
      badges.push(badge);
      return Promise.resolve(badge);
    },
    getProfile: () =>
      Promise.resolve({ handle: "magpie", display_name: "Magpie", avatar_url: null }),
  };

  return {
    port,
    rows,
    badges,
    advance(seconds: number) {
      clock = new Date(clock.getTime() + seconds * 1000);
    },
  };
}

async function startAndApprove(h: ReturnType<typeof makePort>) {
  const started = await startDeviceAuth(h.port, { badge_uid: "e6614103aa01" }, WEB);
  await approveDeviceAuth(h.port, { user_code: started.user_code, confirm: true }, "user-1");
  return started;
}

// start

Deno.test("start returns a code pair and a scannable verification url", async () => {
  const h = makePort();
  const res = await startDeviceAuth(h.port, { badge_uid: "e6614103aa01" }, `${WEB}/`);

  assertEquals(res.interval, DEFAULT_POLL_INTERVAL_SECONDS);
  assertEquals(res.expires_in, 600);
  assertEquals(res.verification_uri, `${WEB}/link`);
  assertEquals(res.verification_uri_complete, `${WEB}/link?code=${res.user_code}`);
  // XXXX-XXXX from the unambiguous alphabet.
  assert(
    /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(
      res.user_code,
    ),
  );
});

Deno.test("start stores only the hash of the device code, never the code", async () => {
  const h = makePort();
  const res = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  const serialized = JSON.stringify(h.rows);
  assert(!serialized.includes(res.device_code), "raw device code must not be persisted");
});

Deno.test("start issues a distinct device code and user code each time", async () => {
  const h = makePort();
  const a = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  const b = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  assert(a.device_code !== b.device_code);
  assert(a.user_code !== b.user_code);
});

// poll

Deno.test("poll on a pending row reports authorization_pending", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  const err = await assertRejects(
    () => pollDeviceAuth(h.port, { device_code: started.device_code }),
    ApiError,
  );
  assertEquals(err.status, 202);
  assertEquals(err.code, "authorization_pending");
});

Deno.test("poll rejects an unknown device code without confirming it never existed", async () => {
  const h = makePort();
  const err = await assertRejects(
    () => pollDeviceAuth(h.port, { device_code: "not-a-real-code" }),
    ApiError,
  );
  // Same code and status an expired token gets, so the response is not an
  // oracle for whether a device code was ever issued.
  assertEquals(err.code, "expired_token");
  assertEquals(err.status, 400);
});

Deno.test("poll widens the interval when called faster than agreed", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);

  await assertRejects(() => pollDeviceAuth(h.port, { device_code: started.device_code }), ApiError);

  // Immediately again, inside the interval.
  const err = await assertRejects(
    () => pollDeviceAuth(h.port, { device_code: started.device_code }),
    ApiError,
  );
  assertEquals(err.code, "slow_down");
  assertEquals(err.status, 429);
  assertEquals(
    err.topLevel?.retry_after,
    DEFAULT_POLL_INTERVAL_SECONDS + SLOW_DOWN_INCREMENT_SECONDS,
  );
  assertEquals(
    h.rows[0]!.poll_interval_s,
    DEFAULT_POLL_INTERVAL_SECONDS + SLOW_DOWN_INCREMENT_SECONDS,
  );
});

Deno.test("poll expires a code once its ttl has passed", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  h.advance(601);

  const err = await assertRejects(
    () => pollDeviceAuth(h.port, { device_code: started.device_code }),
    ApiError,
  );
  assertEquals(err.code, "expired_token");
  assertEquals(h.rows[0]!.status, "expired");
});

Deno.test("poll mints the badge token only after approval", async () => {
  const h = makePort();
  const started = await startAndApprove(h);
  h.advance(10);

  const res = await pollDeviceAuth(h.port, { device_code: started.device_code });
  assert(res.kind === "claimed");
  assert(res.badge_token.length > 0);
  assertEquals(res.user.handle, "magpie");
  assertEquals(h.rows[0]!.status, "claimed");
});

Deno.test("the badge token is stored only as a hash", async () => {
  const h = makePort();
  const started = await startAndApprove(h);
  h.advance(10);
  const res = await pollDeviceAuth(h.port, { device_code: started.device_code });
  assert(res.kind === "claimed");

  const badgeRow = h.badges[0]!;
  const serialized = JSON.stringify(badgeRow);
  assert(!serialized.includes(res.badge_token), "raw badge token must not be persisted");
});

Deno.test("a claimed device code cannot be replayed for a second token", async () => {
  const h = makePort();
  const started = await startAndApprove(h);
  h.advance(10);
  await pollDeviceAuth(h.port, { device_code: started.device_code });

  h.advance(10);
  const err = await assertRejects(
    () => pollDeviceAuth(h.port, { device_code: started.device_code }),
    ApiError,
  );
  assertEquals(err.code, "expired_token");
  // Exactly one badge was ever created.
  assertEquals(h.badges.length, 1);
});

Deno.test("poll reports access_denied after the user declines", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  await approveDeviceAuth(h.port, { user_code: started.user_code, confirm: false }, "user-1");

  const err = await assertRejects(
    () => pollDeviceAuth(h.port, { device_code: started.device_code }),
    ApiError,
  );
  assertEquals(err.code, "access_denied");
});

Deno.test("a device code is looked up by hash, so the stored value is not usable", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  const storedHash = await sha256Bytea(started.device_code);

  // Presenting the hash itself must not authenticate: it hashes to something
  // else. This is what makes a database read non-replayable.
  const err = await assertRejects(
    () => pollDeviceAuth(h.port, { device_code: storedHash }),
    ApiError,
  );
  assertEquals(err.code, "expired_token");
});

// pairing hijack

async function pairBadge(h: ReturnType<typeof makePort>, uid: string, userId: string) {
  const started = await startDeviceAuth(h.port, { badge_uid: uid }, WEB);
  await approveDeviceAuth(h.port, { user_code: started.user_code, confirm: true }, userId);
  h.advance(10);
  return pollDeviceAuth(h.port, { device_code: started.device_code });
}

Deno.test("a fresh pairing cannot displace a badge owned by another user", async () => {
  const h = makePort();
  const uid = "e6614103aa01";

  // The legitimate owner pairs the badge.
  await pairBadge(h, uid, "victim");

  // An attacker who only knows the uid starts and approves their own pairing.
  const attacker = await startDeviceAuth(h.port, { badge_uid: uid }, WEB);
  await approveDeviceAuth(h.port, { user_code: attacker.user_code, confirm: true }, "attacker");
  h.advance(10);

  await assertRejects(
    () => pollDeviceAuth(h.port, { device_code: attacker.device_code }),
    ApiError,
  );

  // The victim's badge is untouched: still active, still theirs.
  const active = h.badges.filter((b) => b.badge_uid === uid && b.revoked_at === null);
  assertEquals(active.length, 1);
  assertEquals(active[0]!.user_id, "victim");
});

Deno.test("the same owner can re-pair, rotating the token", async () => {
  const h = makePort();
  const uid = "e6614103aa01";

  await pairBadge(h, uid, "user-1");
  await pairBadge(h, uid, "user-1");

  // One active badge, still the same owner; the first is revoked.
  const active = h.badges.filter((b) => b.badge_uid === uid && b.revoked_at === null);
  assertEquals(active.length, 1);
  assertEquals(active[0]!.user_id, "user-1");
  assertEquals(h.badges.filter((b) => b.revoked_at !== null).length, 1);
});

// approve

Deno.test("approve binds the code to the confirming user and mints nothing", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "e6614103aa01" }, WEB);

  const res = await approveDeviceAuth(
    h.port,
    { user_code: started.user_code, confirm: true },
    "user-1",
  );
  assertEquals(res.status, "approved");
  assertEquals(h.rows[0]!.status, "approved");
  assertEquals(h.rows[0]!.user_id, "user-1");
  // The browser never sees a badge token: none exists yet.
  assertEquals(h.badges.length, 0);
});

Deno.test("approve refuses an unknown code", async () => {
  const h = makePort();
  const err = await assertRejects(
    () => approveDeviceAuth(h.port, { user_code: "WXYZ-2345", confirm: true }, "user-1"),
    ApiError,
  );
  assertEquals(err.code, "invalid_user_code");
});

Deno.test("approve locks a code after repeated failed attempts", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  // Expire it so every attempt is a wrong-state attempt.
  h.advance(601);

  for (let i = 0; i < MAX_FAILED_LOOKUPS; i++) {
    await assertRejects(
      () => approveDeviceAuth(h.port, { user_code: started.user_code, confirm: true }, "user-1"),
      ApiError,
    );
  }

  const err = await assertRejects(
    () => approveDeviceAuth(h.port, { user_code: started.user_code, confirm: true }, "user-1"),
    ApiError,
  );
  assertEquals(err.code, "too_many_attempts");
  assertEquals(err.status, 429);
});

Deno.test("approve cannot re-approve an already approved code for another user", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  await approveDeviceAuth(h.port, { user_code: started.user_code, confirm: true }, "user-1");

  // An attacker who learns the short code cannot rebind a pending pairing to
  // themselves after the legitimate user has confirmed.
  await assertRejects(
    () => approveDeviceAuth(h.port, { user_code: started.user_code, confirm: true }, "attacker"),
    ApiError,
  );
  assertEquals(h.rows[0]!.user_id, "user-1");
});

Deno.test("approve refuses an expired code", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  h.advance(601);

  const err = await assertRejects(
    () => approveDeviceAuth(h.port, { user_code: started.user_code, confirm: true }, "user-1"),
    ApiError,
  );
  assertEquals(err.code, "invalid_user_code");
});

Deno.test("declining marks the code denied and is terminal", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);

  const res = await approveDeviceAuth(
    h.port,
    { user_code: started.user_code, confirm: false },
    "user-1",
  );
  assertEquals(res.status, "denied");

  await assertRejects(
    () => approveDeviceAuth(h.port, { user_code: started.user_code, confirm: true }, "user-1"),
    ApiError,
  );
});

// anti-phishing

Deno.test("shortBadgeId is stable, short, and derived from the hardware uid", () => {
  assertEquals(shortBadgeId("e6614103aa01"), "03AA01");
  assertEquals(shortBadgeId("e6614103aa01"), shortBadgeId("e6614103aa01"));
  assertEquals(shortBadgeId("ab"), "AB");
});

// full flow

Deno.test("the happy path runs start, approve, poll exactly once each", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "e6614103aa01" }, WEB);

  // Badge polls while the user is still reaching for their phone.
  await assertRejects(() => pollDeviceAuth(h.port, { device_code: started.device_code }), ApiError);

  h.advance(DEFAULT_POLL_INTERVAL_SECONDS + 1);
  await approveDeviceAuth(h.port, { user_code: started.user_code, confirm: true }, "user-1");

  h.advance(DEFAULT_POLL_INTERVAL_SECONDS + 1);
  const res = await pollDeviceAuth(h.port, { device_code: started.device_code });

  assert(res.kind === "claimed");
  assertEquals(h.badges.length, 1);
  assertEquals(h.badges[0]!.user_id, "user-1");
  assertEquals(h.rows[0]!.status, "claimed");
});

// preview

Deno.test("preview names the badge so the confirm screen can be checked", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "e6614103aa01" }, WEB);

  const res = await previewDeviceAuth(h.port, { user_code: started.user_code });
  assertEquals(res.badge, "03AA01");
  assert(res.expires_in > 0 && res.expires_in <= 600);
});

Deno.test("preview reveals nothing about an unknown code", async () => {
  const h = makePort();
  const err = await assertRejects(
    () => previewDeviceAuth(h.port, { user_code: "WXYZ-2345" }),
    ApiError,
  );
  assertEquals(err.code, "invalid_user_code");
});

Deno.test("preview cannot distinguish claimed or denied from unknown", async () => {
  const h = makePort();
  const started = await startAndApprove(h);
  h.advance(10);
  await pollDeviceAuth(h.port, { device_code: started.device_code });

  // Claimed. A caller must not learn that this code existed and was used.
  const err = await assertRejects(
    () => previewDeviceAuth(h.port, { user_code: started.user_code }),
    ApiError,
  );
  assertEquals(err.code, "invalid_user_code");
  assertEquals(err.status, 404);
});

Deno.test("preview misses count toward the same lockout as approve", async () => {
  const h = makePort();
  const started = await startDeviceAuth(h.port, { badge_uid: "uid" }, WEB);
  h.advance(601); // expired, so every attempt is a miss

  for (let i = 0; i < MAX_FAILED_LOOKUPS; i++) {
    await assertRejects(
      () => previewDeviceAuth(h.port, { user_code: started.user_code }),
      ApiError,
    );
  }

  // The lockout is shared: preview cannot be used to exhaust guesses that
  // approve would have refused.
  const err = await assertRejects(
    () => approveDeviceAuth(h.port, { user_code: started.user_code, confirm: true }, "user-1"),
    ApiError,
  );
  assertEquals(err.code, "too_many_attempts");
});

// verification urls

Deno.test("the QR url carries the code, whichever base is configured", () => {
  const plain = buildVerificationUrls("WXYZ-2345", "https://magpi.example.com/");
  assertEquals(plain.verification_uri, "https://magpi.example.com/link");
  assertEquals(plain.verification_uri_complete, "https://magpi.example.com/link?code=WXYZ-2345");

  // A vanity shortlink replaces the origin entirely rather than having
  // /link appended to it.
  const shortlink = buildVerificationUrls(
    "WXYZ-2345",
    "https://magpi.example.com",
    "https://magpi.link/pair",
  );
  assertEquals(shortlink.verification_uri, "https://magpi.link/pair");
  assertEquals(shortlink.verification_uri_complete, "https://magpi.link/pair?code=WXYZ-2345");
});

Deno.test("a shortlink that already has a query string keeps it", () => {
  const res = buildVerificationUrls(
    "WXYZ-2345",
    "https://magpi.example.com",
    "https://magpi.link/p?v=1",
  );
  assertEquals(res.verification_uri_complete, "https://magpi.link/p?v=1&code=WXYZ-2345");
});
