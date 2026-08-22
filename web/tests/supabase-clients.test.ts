import type * as ReactModule from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// `cache` memoizes for the lifetime of a request. There is no request here, so
// it is replaced with the identity: otherwise the first test's answer would be
// handed to every test after it.
vi.mock("react", async () => {
  const react = await vi.importActual<typeof ReactModule>("react");
  return { ...react, cache: <T>(fn: T): T => fn };
});

interface CookieRecord {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

const mocked = vi.hoisted(() => ({
  ssr: {
    /** Arguments the last createServerClient call received. */
    serverArgs: null as { url: string; key: string } | null,
    browserArgs: null as { url: string; key: string } | null,
    /** The cookie adapter the caller handed to @supabase/ssr. */
    adapter: null as {
      getAll(): { name: string; value: string }[];
      setAll(cookies: { name: string; value: string; options?: Record<string, unknown> }[]): void;
    } | null,
  },
  js: {
    args: null as { url: string; key: string; options: Record<string, unknown> } | null,
  },
  store: {
    cookies: [] as CookieRecord[],
    /** Set when the store is read-only, which is what a server component sees. */
    setThrows: false,
  },
  auth: {
    user: null as { id: string } | null,
    session: null as { access_token: string } | null,
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (url: string, key: string, options: { cookies: never }) => {
    mocked.ssr.serverArgs = { url, key };
    mocked.ssr.adapter = options.cookies;
    return {
      auth: {
        getUser: async () => ({ data: { user: mocked.auth.user }, error: null }),
        getSession: async () => ({ data: { session: mocked.auth.session } }),
      },
    };
  },
  createBrowserClient: (url: string, key: string) => {
    mocked.ssr.browserArgs = { url, key };
    return { marker: "ssr-browser" };
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options: Record<string, unknown>) => {
    mocked.js.args = { url, key, options };
    return { marker: "supabase-js" };
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => mocked.store.cookies.map(({ name, value }) => ({ name, value })),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      if (mocked.store.setThrows) throw new Error("Cookies can only be modified in an action");
      mocked.store.cookies.push({ name, value, options });
    },
  }),
}));

const { createClient: createBrowserSupabase } = await import("@/lib/supabase/browser");
const { createClient: createServerSupabase } = await import("@/lib/supabase/server");
const { createServiceClient } = await import("@/lib/supabase/service");
const { getSessionContext } = await import("@/lib/supabase/context");

afterEach(() => {
  mocked.store.cookies = [];
  mocked.store.setThrows = false;
  mocked.auth.user = null;
  mocked.auth.session = null;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the browser client", () => {
  it("uses the url and key it is handed, because a build may have withheld them", () => {
    createBrowserSupabase("https://proj.supabase.co", "sb_publishable_test");

    expect(mocked.ssr.browserArgs).toEqual({
      url: "https://proj.supabase.co",
      key: "sb_publishable_test",
    });
  });
});

describe("the server client", () => {
  it("uses the publishable key, so row-level security still applies", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    await createServerSupabase();

    expect(mocked.ssr.serverArgs).toEqual({
      url: "https://proj.supabase.co",
      key: "sb_publishable_test",
    });
  });

  it("reads the request's cookies", async () => {
    mocked.store.cookies = [{ name: "sb-proj-auth-token", value: "abc" }];
    await createServerSupabase();

    expect(mocked.ssr.adapter?.getAll()).toEqual([{ name: "sb-proj-auth-token", value: "abc" }]);
  });

  it("writes a refreshed cookie back to the store", async () => {
    await createServerSupabase();
    mocked.ssr.adapter?.setAll([
      { name: "sb-proj-auth-token", value: "fresh", options: { path: "/" } },
    ]);

    expect(mocked.store.cookies).toEqual([
      { name: "sb-proj-auth-token", value: "fresh", options: { path: "/" } },
    ]);
  });

  it("stays quiet when the store is read-only, since middleware does the refresh", async () => {
    mocked.store.setThrows = true;
    await createServerSupabase();

    expect(() =>
      mocked.ssr.adapter?.setAll([{ name: "sb-proj-auth-token", value: "fresh" }]),
    ).not.toThrow();
  });
});

describe("the service client", () => {
  it("uses the secret key, which is the only reason it exists", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SB_SECRET_KEY", "sb_secret_test");

    createServiceClient();

    expect(mocked.js.args?.url).toBe("https://proj.supabase.co");
    expect(mocked.js.args?.key).toBe("sb_secret_test");
  });

  it("persists nothing, so a caller's cookies cannot bleed into a privileged client", () => {
    vi.stubGlobal("window", undefined);
    createServiceClient();

    expect(mocked.js.args?.options).toMatchObject({
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });
});

describe("the signed-in caller", () => {
  it("reports nobody when there is no user", async () => {
    expect(await getSessionContext()).toBeNull();
  });

  it("reports nobody when there is a user but no session to borrow a token from", async () => {
    mocked.auth.user = { id: "user-1" };
    mocked.auth.session = null;

    expect(await getSessionContext()).toBeNull();
  });

  it("reports nobody when the session carries no access token", async () => {
    mocked.auth.user = { id: "user-1" };
    mocked.auth.session = { access_token: "" };

    expect(await getSessionContext()).toBeNull();
  });

  it("hands back the caller's own token, for the gateway to authorize as them", async () => {
    vi.stubEnv("BADGE_API_URL", "https://proj.supabase.co/functions/v1");
    mocked.auth.user = { id: "user-1" };
    mocked.auth.session = { access_token: "jwt-for-user-1" };

    expect(await getSessionContext()).toEqual({
      user: { id: "user-1" },
      accessToken: "jwt-for-user-1",
      apiBaseUrl: "https://proj.supabase.co/functions/v1",
    });
  });
});
