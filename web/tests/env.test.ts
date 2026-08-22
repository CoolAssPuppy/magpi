import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBadgeApiUrl,
  getPostHogHost,
  getPostHogKey,
  getSecretKey,
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "@/lib/env";

const LOCAL = "http://127.0.0.1:56521";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("reading configuration outside production", () => {
  it("uses the value when one is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    expect(getSupabaseUrl()).toBe("https://proj.supabase.co");
  });

  it("falls back to this project's own local port, not the shared default", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("BADGE_API_URL", "");

    expect(getSupabaseUrl()).toBe(LOCAL);
    expect(getBadgeApiUrl()).toBe(`${LOCAL}/functions/v1`);
  });

  it("falls back to a placeholder key, so a checkout with no backend still builds", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(getSupabasePublishableKey()).toBe("placeholder-publishable-key");
  });
});

describe("reading configuration in production", () => {
  it("refuses to guess, and names the variable that is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    expect(() => getSupabaseUrl()).toThrow(/NEXT_PUBLIC_SUPABASE_URL is not set/);
  });

  it("says there is no production fallback, so nobody goes looking for one", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BADGE_API_URL", "");

    expect(() => getBadgeApiUrl()).toThrow(/no production fallback/);
  });

  it("still accepts a value that is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_live");

    expect(getSupabasePublishableKey()).toBe("sb_publishable_live");
  });
});

describe("the secret key", () => {
  it("refuses to be read in a browser, where it would ship to every visitor", () => {
    expect(() => getSecretKey()).toThrow(/server only/);
  });

  it("reads on a server", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");

    expect(getSecretKey()).toBe("sb_secret_test");
  });

  it("falls back outside production, and throws inside it", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(getSecretKey()).toBe("placeholder-secret-key");

    vi.stubEnv("NODE_ENV", "production");
    expect(() => getSecretKey()).toThrow(/SUPABASE_SECRET_KEY is not set/);
  });
});

describe("analytics configuration", () => {
  it("reports no key when none is set, which is how analytics stays off", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    expect(getPostHogKey()).toBeFalsy();
  });

  it("reports the key when one is set", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    expect(getPostHogKey()).toBe("phc_test");
  });

  it("defaults the host, so only the key has to be configured", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    expect(getPostHogHost()).toBe("https://us.i.posthog.com");
  });

  it("uses a self-hosted host when one is given", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://ph.example.com");
    expect(getPostHogHost()).toBe("https://ph.example.com");
  });
});
