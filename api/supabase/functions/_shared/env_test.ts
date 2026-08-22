import { assertEquals } from "@std/assert";
import { publishableKey, secretKey } from "./env.ts";

const NAMES = [
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEYS",
  "SUPABASE_ANON_KEY",
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
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_new" }),
      SUPABASE_SERVICE_ROLE_KEY: "legacy-jwt",
    },
    () => assertEquals(secretKey(), "sb_secret_new"),
  );
});

Deno.test("secretKey falls back to the legacy name when the key map is absent", () => {
  withEnv({ SUPABASE_SERVICE_ROLE_KEY: "legacy-jwt" }, () =>
    assertEquals(secretKey(), "legacy-jwt"),
  );
});

Deno.test("secretKey falls back rather than throwing on malformed JSON", () => {
  withEnv({ SUPABASE_SECRET_KEYS: "{not json", SUPABASE_SERVICE_ROLE_KEY: "legacy-jwt" }, () =>
    assertEquals(secretKey(), "legacy-jwt"),
  );
});

Deno.test("secretKey falls back when the key map has no default entry", () => {
  withEnv(
    {
      SUPABASE_SECRET_KEYS: JSON.stringify({ other: "sb_secret_other" }),
      SUPABASE_SERVICE_ROLE_KEY: "legacy-jwt",
    },
    () => assertEquals(secretKey(), "legacy-jwt"),
  );
});

Deno.test("secretKey is undefined when nothing is configured", () => {
  withEnv({}, () => assertEquals(secretKey(), undefined));
});

Deno.test("publishableKey prefers the new key map", () => {
  withEnv(
    {
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: "sb_publishable_new" }),
      SUPABASE_ANON_KEY: "legacy-jwt",
    },
    () => assertEquals(publishableKey(), "sb_publishable_new"),
  );
});

Deno.test("publishableKey falls back to the legacy name when the key map is absent", () => {
  withEnv({ SUPABASE_ANON_KEY: "legacy-jwt" }, () => assertEquals(publishableKey(), "legacy-jwt"));
});

Deno.test("publishableKey falls back rather than throwing on malformed JSON", () => {
  withEnv({ SUPABASE_PUBLISHABLE_KEYS: "[]", SUPABASE_ANON_KEY: "legacy-jwt" }, () =>
    assertEquals(publishableKey(), "legacy-jwt"),
  );
});

Deno.test("publishableKey is undefined when nothing is configured", () => {
  withEnv({}, () => assertEquals(publishableKey(), undefined));
});
