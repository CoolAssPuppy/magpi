// Fallbacks let `next build` and the tests run with no live backend, and apply
// outside production only. Port 56521 is this project's own: the Supabase
// default 54321 is taken, so it would talk to a different database.

const LOCAL_SUPABASE_URL = "http://127.0.0.1:56521";

// The value is passed in rather than looked up by name. Next replaces the
// literal text `process.env.NEXT_PUBLIC_FOO` with its value when it builds a
// client bundle, so the read has to be spelled out in full to survive. A
// lookup through a computed key matches none of that substitution, so nothing
// replaces it and it reads undefined in the browser while working on the
// server, where a real environment exists.
function required(name: string, value: string | undefined, devFallback: string): string {
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${name} is not set. Configure it in the deployment environment; there is no production fallback.`,
    );
  }
  return devFallback;
}

export function getSupabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    LOCAL_SUPABASE_URL,
  );
}

export function getSupabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "placeholder-publishable-key",
  );
}

export function getBadgeApiUrl(): string {
  return required("BADGE_API_URL", process.env.BADGE_API_URL, `${LOCAL_SUPABASE_URL}/functions/v1`);
}

/** Server only. Bypasses RLS, so this guard turns a client import into a failure. */
export function getSecretKey(): string {
  if (typeof window !== "undefined") {
    throw new Error("The secret key is server only and must not be read in the browser.");
  }
  return required("SB_SECRET_KEY", process.env.SB_SECRET_KEY, "placeholder-secret-key");
}

/** Optional. Analytics stays disabled when this is absent. */
export function getPostHogKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY;
}

export function getPostHogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
}
