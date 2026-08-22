import { assert, assertEquals, assertThrows } from "@std/assert";
import { ApiError } from "./errors.ts";
import {
  parseProviderMeta,
  type ProviderRecord,
  PROVIDER_META_FIELDS,
  requireEnabledProvider,
  requireOAuthProvider,
} from "./providers.ts";

function record(overrides: Partial<ProviderRecord> = {}): ProviderRecord {
  return {
    slug: "linear",
    display_name: "Linear",
    description: "Issues assigned to you.",
    kind: "oauth",
    auth_url: "https://linear.app/oauth/authorize",
    token_url: "https://api.linear.app/oauth/token",
    scopes: ["read"],
    docs_url: null,
    enabled: true,
    position: 20,
    ...overrides,
  };
}

const apiKeyRecord = record({
  slug: "posthog",
  display_name: "PostHog",
  kind: "api_key",
  auth_url: null,
  token_url: null,
  scopes: [],
});

Deno.test("an unknown provider and a disabled one are one answer", () => {
  // Telling them apart lets a caller walk the registry for slugs that exist
  // but are switched off.
  const missing = assertThrows(() => requireEnabledProvider(null), ApiError);
  const disabled = assertThrows(() => requireEnabledProvider(record({ enabled: false })), ApiError);

  assertEquals(missing.status, 404);
  assertEquals(missing.code, "unknown_provider");
  assertEquals(disabled.status, missing.status);
  assertEquals(disabled.code, missing.code);
  assertEquals(disabled.message, missing.message);
});

Deno.test("an enabled provider passes through unchanged", () => {
  const enabled = record();
  assertEquals(requireEnabledProvider(enabled), enabled);
});

Deno.test("an api_key provider is refused by the oauth path, by name", () => {
  const err = assertThrows(() => requireOAuthProvider(apiKeyRecord), ApiError);
  assertEquals(err.status, 400);
  assertEquals(err.code, "provider_not_oauth");
  assert(err.message.includes("posthog"));
});

Deno.test("an oauth provider narrows to non-null endpoints", () => {
  const narrowed = requireOAuthProvider(record());
  assertEquals(narrowed.kind, "oauth");
  assertEquals(narrowed.auth_url, "https://linear.app/oauth/authorize");
  assertEquals(narrowed.token_url, "https://api.linear.app/oauth/token");
});

Deno.test("an oauth row missing its endpoints is a server fault, not the caller's", () => {
  // The providers_oauth_urls_present constraint should make this unreachable.
  // A 400 here would tell the user to fix something only a migration can.
  for (const broken of [record({ auth_url: null }), record({ token_url: null })]) {
    const err = assertThrows(() => requireOAuthProvider(broken), ApiError);
    assertEquals(err.status, 500);
    assertEquals(err.code, "misconfigured");
  }
});

Deno.test("meta accepts only the fields a provider declares", () => {
  assertEquals(
    parseProviderMeta("posthog", {
      host: "https://eu.posthog.com",
      project_id: "12345",
      insight_id: "abc",
    }),
    { host: "https://eu.posthog.com", project_id: "12345", insight_id: "abc" },
  );
  assertEquals(parseProviderMeta("vercel", { team_id: "team_1" }), { team_id: "team_1" });
  assertEquals(parseProviderMeta("posthog", {}), {});
  assertEquals(parseProviderMeta("posthog", null), {});
  assertEquals(parseProviderMeta("posthog", undefined), {});
});

Deno.test("an unknown meta field is rejected rather than dropped", () => {
  // Dropping it would let someone believe they had configured something.
  const err = assertThrows(
    () => parseProviderMeta("posthog", { host: "https://eu.posthog.com", api_key: "phx_leak" }),
    ApiError,
  );
  assertEquals(err.status, 400);
  assert(err.message.includes("api_key"));
});

Deno.test("a provider with no declared meta fields accepts none", () => {
  assertEquals(parseProviderMeta("linear", {}), {});
  assertThrows(() => parseProviderMeta("linear", { host: "x" }), ApiError);
  // Inherited keys must not resolve an allowlist.
  assertThrows(() => parseProviderMeta("constructor", { host: "x" }), ApiError);
});

Deno.test("meta values must be bounded non-empty strings", () => {
  for (const bad of [
    { host: "" },
    { host: "x".repeat(257) },
    { host: 42 },
    { host: null },
    { host: { nested: true } },
    { host: ["a"] },
  ]) {
    const err = assertThrows(() => parseProviderMeta("posthog", bad), ApiError);
    assertEquals(err.status, 400);
  }
});

Deno.test("meta must be an object, not an array or a scalar", () => {
  for (const bad of [["host"], "host", 42, true]) {
    assertThrows(() => parseProviderMeta("posthog", bad), ApiError);
  }
});

Deno.test("no declared meta field could carry a secret", () => {
  // meta is not encrypted and is readable by the owning user. A key or token
  // belongs in access_token_enc.
  for (const [slug, fields] of Object.entries(PROVIDER_META_FIELDS)) {
    for (const field of fields) {
      assert(!/key|token|secret|password/i.test(field), `${slug}.${field} looks like a secret`);
    }
  }
});
