import { assertEquals } from "@std/assert";
import { publishableKey, secretKey } from "./env.ts";

/** Both prefixes, so a test can prove which one wins. */
const NAMES = [
  "SB_SECRET_KEYS",
  "SB_SECRET_KEY",
  "SB_PUBLISHABLE_KEYS",
  "SB_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_PUBLISHABLE_KEYS",
  "SUPABASE_PUBLISHABLE_KEY",
] as const;

/** Runs fn with exactly the given key variables set, restoring the rest afterwards. */
function withEnv(vars: Partial<Record<(typeof NAMES)[number], string>>, fn: () => void): void {
  const saved = NAMES.map((name) => [name, Deno.env.get(name)] as const);
  for (const name of NAMES) Deno.env.delete(name);
  for (const [name, value] of Object.entries(vars)) Deno.env.set(name, value);
  try {
    fn();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

Deno.test("secretKey prefers the new key map", () => {
  withEnv(
    {
      SB_SECRET_KEYS: JSON.stringify({ default: "sb_secret_new" }),
      SB_SECRET_KEY: "plain-key",
    },
    () => assertEquals(secretKey(), "sb_secret_new"),
  );
});

Deno.test("secretKey falls back to the plain name when the key map is absent", () => {
  withEnv({ SB_SECRET_KEY: "plain-key" }, () => assertEquals(secretKey(), "plain-key"));
});

Deno.test("secretKey falls back rather than throwing on malformed JSON", () => {
  withEnv({ SB_SECRET_KEYS: "{not json", SB_SECRET_KEY: "plain-key" }, () =>
    assertEquals(secretKey(), "plain-key"),
  );
});

Deno.test("secretKey falls back when the key map has no default entry", () => {
  withEnv(
    {
      SB_SECRET_KEYS: JSON.stringify({ other: "sb_secret_other" }),
      SB_SECRET_KEY: "plain-key",
    },
    () => assertEquals(secretKey(), "plain-key"),
  );
});

Deno.test("secretKey is undefined when nothing is configured", () => {
  withEnv({}, () => assertEquals(secretKey(), undefined));
});

Deno.test("publishableKey prefers the new key map", () => {
  withEnv(
    {
      SB_PUBLISHABLE_KEYS: JSON.stringify({ default: "sb_publishable_new" }),
      SB_PUBLISHABLE_KEY: "plain-key",
    },
    () => assertEquals(publishableKey(), "sb_publishable_new"),
  );
});

Deno.test("publishableKey falls back to the plain name when the key map is absent", () => {
  withEnv({ SB_PUBLISHABLE_KEY: "plain-key" }, () => assertEquals(publishableKey(), "plain-key"));
});

Deno.test("publishableKey falls back rather than throwing on malformed JSON", () => {
  withEnv({ SB_PUBLISHABLE_KEYS: "[]", SB_PUBLISHABLE_KEY: "plain-key" }, () =>
    assertEquals(publishableKey(), "plain-key"),
  );
});

Deno.test("publishableKey is undefined when nothing is configured", () => {
  withEnv({}, () => assertEquals(publishableKey(), undefined));
});

// SUPABASE_ is reserved by the platform, so a secrets manager cannot write a
// key under it. These two cases pin the fallback that keeps an older local
// .env working, and the order between the two prefixes.

Deno.test("secretKey still reads a key left under the reserved prefix", () => {
  withEnv({ SUPABASE_SECRET_KEY: "old-local-key" }, () =>
    assertEquals(secretKey(), "old-local-key"),
  );
});

Deno.test("the project's own prefix wins over the reserved one", () => {
  withEnv({ SB_SECRET_KEY: "ours", SUPABASE_SECRET_KEY: "theirs" }, () =>
    assertEquals(secretKey(), "ours"),
  );
});

Deno.test("publishableKey still reads a key left under the reserved prefix", () => {
  withEnv({ SUPABASE_PUBLISHABLE_KEY: "old-local-key" }, () =>
    assertEquals(publishableKey(), "old-local-key"),
  );
});

Deno.test("publishableKey prefers the project's own prefix", () => {
  withEnv({ SB_PUBLISHABLE_KEY: "ours", SUPABASE_PUBLISHABLE_KEY: "theirs" }, () =>
    assertEquals(publishableKey(), "ours"),
  );
});
