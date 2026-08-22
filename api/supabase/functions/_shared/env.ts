// API key lookup for the Edge Function runtime.
//
// Current runtimes inject SUPABASE_PUBLISHABLE_KEYS and SUPABASE_SECRET_KEYS,
// each a JSON object of named keys. Older ones inject only the legacy
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY, and the runtime version is
// the platform's choice rather than ours, so both paths stay live.

/** Reads the "default" entry of a JSON key map, treating any malformed value as absent. */
function defaultKey(name: string): string | undefined {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) return undefined;
  const value = (parsed as Record<string, unknown>).default;
  return typeof value === "string" && value ? value : undefined;
}

function legacyKey(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}

/** Server-side key that bypasses RLS. */
export function secretKey(): string | undefined {
  return defaultKey("SUPABASE_SECRET_KEYS") ?? legacyKey("SUPABASE_SERVICE_ROLE_KEY");
}

/** Client-safe key; RLS applies. */
export function publishableKey(): string | undefined {
  return defaultKey("SUPABASE_PUBLISHABLE_KEYS") ?? legacyKey("SUPABASE_ANON_KEY");
}
