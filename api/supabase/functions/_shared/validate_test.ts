import { assert, assertEquals, assertThrows } from "@std/assert";
import { ApiError } from "./errors.ts";
import {
  connectionsBeginSchema,
  connectionsClaimOrKeySchema,
  connectionsClaimSchema,
  connectionsKeySchema,
  deviceApproveSchema,
  devicePollSchema,
  deviceStartSchema,
  isValidSlug,
  parseBody,
} from "./validate.ts";

Deno.test("deviceStartSchema accepts a badge identifying itself", () => {
  assertEquals(
    deviceStartSchema.parse({
      badge_uid: "e6614103xxxx",
      fw: "1.2.0",
      sdk: "1.0.0",
    }),
    {
      badge_uid: "e6614103xxxx",
      fw: "1.2.0",
      sdk: "1.0.0",
    },
  );
});

Deno.test("deviceStartSchema rejects missing, empty, and unknown fields", () => {
  assert(!deviceStartSchema.safeParse({ badge_uid: "x", fw: "1" }).success);
  assert(!deviceStartSchema.safeParse({ badge_uid: "", fw: "1", sdk: "1" }).success);
  assert(
    !deviceStartSchema.safeParse({
      badge_uid: "x",
      fw: "1",
      sdk: "1",
      user_id: "someone-else",
    }).success,
  );
});

Deno.test("devicePollSchema requires a device_code string", () => {
  assert(devicePollSchema.safeParse({ device_code: "abc" }).success);
  assert(!devicePollSchema.safeParse({}).success);
  assert(!devicePollSchema.safeParse({ device_code: 42 }).success);
  assert(!devicePollSchema.safeParse({ device_code: "abc", extra: 1 }).success);
});

Deno.test("deviceApproveSchema enforces the XXXX-XXXX unambiguous format", () => {
  assert(deviceApproveSchema.safeParse({ user_code: "WXYZ-2345", confirm: true }).success);
  // 0, 1, I and O are ambiguous and are not in the alphabet, so a code
  // containing one was never issued and must not validate.
  for (const bad of ["WXYZ-234O", "WXYZ-234I", "WXYZ-2340", "WXYZ-2341", "WXYZ2345", "wxyz-2345"]) {
    assert(!deviceApproveSchema.safeParse({ user_code: bad, confirm: true }).success, bad);
  }
  // confirm must be a real boolean; the core decides true vs false.
  assert(!deviceApproveSchema.safeParse({ user_code: "WXYZ-2345", confirm: "true" }).success);
  assert(deviceApproveSchema.safeParse({ user_code: "WXYZ-2345", confirm: false }).success);
});

Deno.test("connectionsBeginSchema takes a provider slug and an optional return_to", () => {
  assert(connectionsBeginSchema.safeParse({ provider: "github" }).success);
  assert(
    connectionsBeginSchema.safeParse({
      provider: "github",
      return_to: "/connections",
    }).success,
  );
  assert(!connectionsBeginSchema.safeParse({ provider: "GitHub" }).success);
  assert(!connectionsBeginSchema.safeParse({ provider: "../etc" }).success);
  assert(!connectionsBeginSchema.safeParse({ provider: "-leading-hyphen" }).success);
  assert(!connectionsBeginSchema.safeParse({}).success);
  assert(
    !connectionsBeginSchema.safeParse({
      provider: "github",
      return_to: "x".repeat(513),
    }).success,
  );
});

Deno.test("connectionsClaimSchema bounds the ticket without matching its shape", () => {
  // A malformed ticket must fail the hash lookup like any other unknown one,
  // so "wrong shape" and "already used" stay indistinguishable.
  assert(connectionsClaimSchema.safeParse({ ticket: "!!!not-base64url!!!" }).success);
  assert(!connectionsClaimSchema.safeParse({ ticket: "" }).success);
  assert(!connectionsClaimSchema.safeParse({ ticket: "x".repeat(257) }).success);
  assert(!connectionsClaimSchema.safeParse({ ticket: "abc", user_id: "someone" }).success);
});

Deno.test("isValidSlug refuses anything that could escape a url path", () => {
  assert(isValidSlug("posthog"));
  assert(isValidSlug("google-calendar"));
  assert(!isValidSlug("../etc"));
  assert(!isValidSlug("-leading"));
  assert(!isValidSlug("Upper"));
  assert(!isValidSlug(""));
  assert(!isValidSlug("a".repeat(65)));
});

Deno.test("parseBody returns parsed data and throws a typed 400 on failure", () => {
  assertEquals(parseBody(devicePollSchema, { device_code: "x" }), {
    device_code: "x",
  });
  const err = assertThrows(() => parseBody(devicePollSchema, { wrong: 1 }), ApiError);
  assertEquals(err.status, 400);
  assertEquals(err.code, "invalid_request");
  assert(Array.isArray(err.detail?.issues));
  assertThrows(() => parseBody(devicePollSchema, null), ApiError);
});

Deno.test("connectionsKeySchema takes a key and the settings around it", () => {
  const parsed = connectionsKeySchema.parse({
    provider: "posthog",
    api_key: "phx_averyrealkey",
    label: "Work",
    meta: { host: "us.posthog.com", project_id: "64213" },
  });

  assertEquals(parsed.provider, "posthog");
  assertEquals(parsed.meta?.host, "us.posthog.com");
});

Deno.test("connectionsKeySchema refuses a provider slug that could escape a path", () => {
  for (const provider of ["../admin", "Post Hog", "", "-posthog"]) {
    assert(!connectionsKeySchema.safeParse({ provider, api_key: "phx_key12345" }).success);
  }
});

Deno.test("connectionsKeySchema bounds the key, so nothing bulky is parked in a row", () => {
  assert(!connectionsKeySchema.safeParse({ provider: "posthog", api_key: "short" }).success);
  assert(
    !connectionsKeySchema.safeParse({
      provider: "posthog",
      api_key: "x".repeat(513),
    }).success,
  );
});

Deno.test("connectionsKeySchema refuses a field nobody declared", () => {
  assert(
    !connectionsKeySchema.safeParse({
      provider: "posthog",
      api_key: "phx_key12345",
      user_id: "somebody-else",
    }).success,
  );
});

Deno.test("the claim endpoint takes either a ticket or a key, and nothing else", () => {
  assert(connectionsClaimOrKeySchema.safeParse({ ticket: "abc" }).success);
  assert(
    connectionsClaimOrKeySchema.safeParse({
      provider: "vercel",
      api_key: "tok_12345678",
    }).success,
  );
  // Not both at once: that is two ways of establishing one connection.
  assert(
    !connectionsClaimOrKeySchema.safeParse({
      ticket: "abc",
      provider: "vercel",
      api_key: "x",
    }).success,
  );
});
