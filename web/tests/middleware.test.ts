import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  interface Cookie {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }

  const state = {
    user: null as { id: string } | null,
    error: null as { code?: string } | null,
    /** Cookies the auth server rotates onto the response during getUser. */
    rotates: [] as Cookie[],
  };

  return { state };
});

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { setAll(cookies: unknown[]): void } },
  ) => ({
    auth: {
      getUser: async () => {
        if (mocked.state.rotates.length > 0) options.cookies.setAll(mocked.state.rotates);
        return { data: { user: mocked.state.user }, error: mocked.state.error };
      },
    },
  }),
}));

const { updateSession } = await import("@/lib/supabase/middleware");

/** Sets what the auth server will say for the request under test. */
function auth(next: Partial<typeof mocked.state>): void {
  mocked.state.user = next.user ?? null;
  mocked.state.error = next.error ?? null;
  mocked.state.rotates = next.rotates ?? [];
}

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

const SIGNED_IN = { user: { id: "user-1" } };

afterEach(() => {
  auth({});
  vi.unstubAllEnvs();
});

describe("security headers", () => {
  it("puts a nonce on every response and names it in the script policy", async () => {
    auth({});
    const response = await updateSession(request("/"));

    const nonce = response.headers.get("x-nonce");
    expect(nonce).toBeTruthy();
    expect(response.headers.get("Content-Security-Policy")).toContain(`'nonce-${nonce}'`);
  });

  it("uses a fresh nonce per request, so one page's scripts cannot run in another", async () => {
    auth({});
    const first = await updateSession(request("/"));
    const second = await updateSession(request("/"));

    expect(first.headers.get("x-nonce")).not.toBe(second.headers.get("x-nonce"));
  });

  it("sets the rest of the header set", async () => {
    auth({});
    const { headers } = await updateSession(request("/"));

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("denies framing and plugins outright", async () => {
    auth({});
    const csp = (await updateSession(request("/"))).headers.get("Content-Security-Policy") ?? "";

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});

describe("what the page is allowed to connect to", () => {
  it("permits the database over both http and websocket, since realtime needs the socket", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    auth({});

    const csp = (await updateSession(request("/"))).headers.get("Content-Security-Policy") ?? "";
    const connect = csp.split("; ").find((part) => part.startsWith("connect-src")) ?? "";

    expect(connect).toContain("https://proj.supabase.co");
    expect(connect).toContain("wss://proj.supabase.co");
  });

  it("skips a value that is not a url rather than writing a broken policy", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url");
    vi.stubEnv("BADGE_API_URL", "also-not-a-url");
    auth({});

    const csp = (await updateSession(request("/"))).headers.get("Content-Security-Policy") ?? "";
    const connect = csp.split("; ").find((part) => part.startsWith("connect-src")) ?? "";

    expect(connect).toBe("connect-src 'self'");
  });

  it("allows eval in development, because React's dev tooling needs it", async () => {
    vi.stubEnv("NODE_ENV", "development");
    auth({});

    const csp = (await updateSession(request("/"))).headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("drops eval and upgrades to https in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("BADGE_API_URL", "https://proj.supabase.co/functions/v1");
    auth({});

    const response = await updateSession(
      new NextRequest("https://magpi.example/", { headers: new Headers() }),
    );
    const csp = response.headers.get("Content-Security-Policy") ?? "";

    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("leaves loopback alone, so a production build stays runnable over plain http", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("BADGE_API_URL", "https://proj.supabase.co/functions/v1");
    auth({});

    for (const host of ["localhost", "127.0.0.1"]) {
      const response = await updateSession(new NextRequest(`http://${host}:3000/`));
      const csp = response.headers.get("Content-Security-Policy") ?? "";

      expect(csp, `${host} should not be upgraded`).not.toContain("upgrade-insecure-requests");
    }
  });
});

describe("route gating", () => {
  it("sends a stranger asking for a private page to the homepage, which signs in", async () => {
    auth({});
    const response = await updateSession(request("/dashboard"));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/");
  });

  it("remembers where they were going, query string and all", async () => {
    auth({});
    const response = await updateSession(request("/connections?provider=google"));

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("next")).toBe("/connections?provider=google");
  });

  it("gates every private prefix and the paths beneath them", async () => {
    for (const path of ["/dashboard", "/pages", "/connections", "/link", "/settings"]) {
      auth({});
      const exact = await updateSession(request(path));
      expect(exact.status, `${path} should be gated`).toBe(307);

      auth({});
      const nested = await updateSession(request(`${path}/anything`));
      expect(nested.status, `${path}/anything should be gated`).toBe(307);
    }
  });

  it("does not gate a public path that merely starts with the same letters", async () => {
    auth({});
    const response = await updateSession(request("/settingsomething"));

    expect(response.status).toBe(200);
  });

  it("lets a signed-in caller through to a private page", async () => {
    auth(SIGNED_IN);
    const response = await updateSession(request("/dashboard"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends a signed-in caller off the homepage to their dashboard", async () => {
    auth(SIGNED_IN);
    const response = await updateSession(request("/?utm_source=badge"));

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/dashboard");
    expect(location.search).toBe("");
  });

  it("leaves the homepage alone for a stranger, who is who it is written for", async () => {
    auth({});
    const response = await updateSession(request("/"));

    expect(response.status).toBe(200);
  });

  it("puts the header set on a redirect too, not only on a rendered page", async () => {
    auth({});
    const response = await updateSession(request("/dashboard"));

    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
});

describe("a session the auth server refreshed mid-request", () => {
  const ROTATED = [{ name: "sb-proj-auth-token", value: "fresh", options: { path: "/" } }];

  it("carries the new cookie onto a redirect, so the caller is not bounced back out", async () => {
    auth({ ...SIGNED_IN, rotates: ROTATED });
    const response = await updateSession(request("/", "sb-proj-auth-token=old"));

    expect(response.cookies.get("sb-proj-auth-token")?.value).toBe("fresh");
  });

  it("carries the new cookie onto a rendered page", async () => {
    auth({ ...SIGNED_IN, rotates: ROTATED });
    const response = await updateSession(request("/dashboard", "sb-proj-auth-token=old"));

    expect(response.cookies.get("sb-proj-auth-token")?.value).toBe("fresh");
  });
});

describe("a session that can never be refreshed again", () => {
  const DEAD = { error: { code: "refresh_token_not_found" } };
  const COOKIES = "sb-proj-auth-token.0=aaa; sb-proj-auth-token.1=bbb; theme=dark";

  it("deletes every chunk of the auth cookie, so the failure does not repeat forever", async () => {
    auth(DEAD);
    const response = await updateSession(request("/", COOKIES));

    expect(response.cookies.get("sb-proj-auth-token.0")?.value).toBe("");
    expect(response.cookies.get("sb-proj-auth-token.1")?.value).toBe("");
  });

  it("leaves cookies that have nothing to do with auth", async () => {
    auth(DEAD);
    const response = await updateSession(request("/", COOKIES));

    expect(response.cookies.get("theme")).toBeUndefined();
  });

  it("clears the cookie on the way to the homepage as well", async () => {
    auth(DEAD);
    const response = await updateSession(request("/dashboard", COOKIES));

    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-proj-auth-token.0")?.value).toBe("");
  });

  it("treats the caller as signed out, so a dead cookie cannot reach a private page", async () => {
    auth({ user: { id: "user-1" }, error: { code: "session_expired" } });
    const response = await updateSession(request("/dashboard", COOKIES));

    expect(response.status).toBe(307);
  });
});
