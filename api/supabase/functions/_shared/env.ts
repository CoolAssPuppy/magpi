// API key lookup for the edge function runtime.
//
// Supabase's current key names are the publishable key, which is client-safe
// and leaves RLS in force, and the secret key, which bypasses it. The legacy
// anon and service-role JWTs are not read here: this project was built after
// the rename and never issued one.
//
// The runtime injects each as a JSON map of named keys under the plural name,
// so a project can hold more than one key of a kind. The singular name is the
// fallback, which is what `supabase secrets set` writes and what a local
// `.env` holds.

/** Reads the "default" entry of a JSON key map, treating anything malformed as absent. */
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

function plainKey(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}

/** Server-side key that bypasses RLS. Never leaves an edge function. */
export function secretKey(): string | undefined {
  return defaultKey("SUPABASE_SECRET_KEYS") ?? plainKey("SUPABASE_SECRET_KEY");
}

/** Client-safe key. RLS applies. */
export function publishableKey(): string | undefined {
  return defaultKey("SUPABASE_PUBLISHABLE_KEYS") ?? plainKey("SUPABASE_PUBLISHABLE_KEY");
}
