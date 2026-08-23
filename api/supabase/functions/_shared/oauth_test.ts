import { assert, assertEquals, assertNotEquals, assertRejects, assertThrows } from "@std/assert";
import { sha256Base64Url } from "./crypto.ts";
import { ApiError } from "./errors.ts";
import type { ProviderRecord } from "./providers.ts";
import {
  callbackUrl,
  createPkce,
  createState,
  type OAuthDriver,
  oauthDriverFor,
  providerCredentials,
  safeReturnTo,
} from "./oauth.ts";

/** The seeded rows, so the tests exercise the registry the migration ships. */
const REGISTRY: Record<string, ProviderRecord> = {
  google: {
    slug: "google",
    display_name: "Google",
    description: "Calendar events and Gmail message headers.",
    kind: "oauth",
    auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/gmail.metadata",
    ],
    docs_url: null,
    enabled: true,
    position: 10,
  },
  notion: {
    slug: "notion",
    display_name: "Notion",
    description: "Pages waiting on you.",
    kind: "oauth",
    auth_url: "https://api.notion.com/v1/oauth/authorize",
    token_url: "https://api.notion.com/v1/oauth/token",
    // Capabilities are set on the integration, so there is nothing to ask for.
    scopes: [],
    docs_url: null,
    enabled: true,
    position: 35,
  },
  linear: {
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
  },
  slack: {
    slug: "slack",
    display_name: "Slack",
    description: "Mentions across the workspaces you are in.",
    kind: "oauth",
    auth_url: "https://slack.com/oauth/v2/authorize",
    token_url: "https://slack.com/api/oauth.v2.access",
    scopes: ["search:read"],
    docs_url: null,
    enabled: false,
    position: 30,
  },
  github: {
    slug: "github",
    display_name: "GitHub",
    description: "Pull requests waiting on your review.",
    kind: "oauth",
    auth_url: "https://github.com/login/oauth/authorize",
    token_url: "https://github.com/login/oauth/access_token",
    scopes: ["read:user"],
    docs_url: null,
    enabled: false,
    position: 40,
  },
  posthog: {
    slug: "posthog",
    display_name: "PostHog",
    description: "One insight, drawn as a number and a sparkline.",
    kind: "api_key",
    auth_url: null,
    token_url: null,
    scopes: [],
    docs_url: null,
    enabled: true,
    position: 60,
  },
};

const OAUTH_SLUGS = ["google", "linear", "slack", "github", "notion"] as const;

function driver(slug: string): OAuthDriver {
  return oauthDriverFor(REGISTRY[slug]);
}

const AUTH_INPUT = {
  clientId: "client-123",
  redirectUri: "https://api.example.com/functions/v1/connections-callback",
  state: "state-abc",
  codeChallenge: "challenge-xyz",
};

Deno.test("PKCE produces an S256 challenge that matches its verifier", async () => {
  const { verifier, challengePromise } = createPkce();
  const challenge = await challengePromise;

  assertEquals(challenge, await sha256Base64Url(verifier));
  // base64url, no padding, so it survives a query string unescaped.
  assert(/^[A-Za-z0-9_-]+$/.test(challenge));
  assert(verifier.length >= 43, "verifier must carry at least 256 bits of entropy");
});

Deno.test("each attempt gets a distinct verifier and state", async () => {
  const a = createPkce();
  const b = createPkce();
  assertNotEquals(a.verifier, b.verifier);
  assertNotEquals(await a.challengePromise, await b.challengePromise);
  assertNotEquals(createState(), createState());
});

Deno.test("every authorize url is PKCE-bound and points at the registry endpoint", () => {
  for (const slug of OAUTH_SLUGS) {
    const url = new URL(driver(slug).buildAuthUrl(AUTH_INPUT));
    assertEquals(url.origin + url.pathname, REGISTRY[slug].auth_url);
    assertEquals(url.searchParams.get("client_id"), "client-123");
    assertEquals(url.searchParams.get("state"), "state-abc");
    assertEquals(url.searchParams.get("code_challenge"), "challenge-xyz");
    assertEquals(url.searchParams.get("code_challenge_method"), "S256");
    assertEquals(url.searchParams.get("response_type"), "code");
    assertEquals(url.searchParams.get("redirect_uri"), AUTH_INPUT.redirectUri);
  }
});

Deno.test("the scopes asked for are the registry's, never a hardcoded list", () => {
  // A driver that silently stopped asking would be granted whatever the app
  // was last configured with.
  for (const slug of OAUTH_SLUGS) {
    const url = new URL(driver(slug).buildAuthUrl(AUTH_INPUT));
    // Whichever parameter that provider carries them in. Slack splits bot and
    // user scopes across two names.
    const asked = `${url.searchParams.get("scope") ?? ""} ${
      url.searchParams.get("user_scope") ?? ""
    }`;
    for (const wanted of REGISTRY[slug].scopes) {
      assert(asked.includes(wanted), `${slug} did not ask for ${wanted}`);
    }
  }
});

Deno.test("slack asks for a user token, not a bot one", () => {
  // scope buys a bot token; user_scope buys one that acts as the person.
  // Everything this product reads is the person's, and search:read is not a
  // valid bot scope, so asking under scope is asking to be refused.
  const url = new URL(driver("slack").buildAuthUrl(AUTH_INPUT));

  assertEquals(url.searchParams.get("user_scope"), "search:read");
  assertEquals(url.searchParams.get("scope"), null);
});

Deno.test("notion says who is installing, and asks for no scopes", () => {
  // Capabilities live on the integration, so there is nothing to ask for, and
  // the public flow requires an owner.
  const url = new URL(driver("notion").buildAuthUrl(AUTH_INPUT));

  assertEquals(url.searchParams.get("owner"), "user");
  assertEquals(url.searchParams.get("scope"), null);
});

Deno.test("linear separates scopes with commas and everyone else with spaces", () => {
  const custom: ProviderRecord = {
    ...REGISTRY.linear,
    scopes: ["read", "issues:read"],
  };
  assertEquals(
    new URL(oauthDriverFor(custom).buildAuthUrl(AUTH_INPUT)).searchParams.get("scope"),
    "read,issues:read",
  );
  assertEquals(
    new URL(driver("google").buildAuthUrl(AUTH_INPUT)).searchParams.get("scope"),
    REGISTRY.google.scopes.join(" "),
  );
});

Deno.test(
  "google asks for offline access, or the refresh token arrives once and never again",
  () => {
    const url = new URL(driver("google").buildAuthUrl(AUTH_INPUT));
    assertEquals(url.searchParams.get("access_type"), "offline");
    assertEquals(url.searchParams.get("prompt"), "consent");
  },
);

Deno.test("no seeded provider requests a write scope", () => {
  for (const record of Object.values(REGISTRY)) {
    for (const scope of record.scopes) {
      assert(!/write|delete|admin|\bsend\b/i.test(scope), `${record.slug} requests ${scope}`);
    }
  }
  // gmail.readonly would carry message bodies. gmail.metadata is the whole
  // point of that scope choice and must not drift.
  assert(REGISTRY.google.scopes.some((s) => s.endsWith("gmail.metadata")));
  assert(!REGISTRY.google.scopes.some((s) => s.endsWith("gmail.readonly")));
});

Deno.test("an api_key provider never reaches the oauth flow", () => {
  const err = assertThrows(() => oauthDriverFor(REGISTRY.posthog), ApiError);
  assertEquals(err.code, "provider_not_oauth");
  assertEquals(err.status, 400);
});

Deno.test("the callback url is derived from configuration, not from a request", () => {
  Deno.env.set("SUPABASE_URL", "https://api.example.com/");
  assertEquals(callbackUrl(), "https://api.example.com/functions/v1/connections-callback");
});

Deno.test("safeReturnTo accepts same-site paths and rejects open redirects", () => {
  assertEquals(safeReturnTo("/dashboard"), "/dashboard");
  assertEquals(safeReturnTo("/connections/google?tab=scopes"), "/connections/google?tab=scopes");

  // Every one of these is an open redirect if it survives.
  assertEquals(safeReturnTo("//evil.example"), null);
  assertEquals(safeReturnTo("https://evil.example"), null);
  assertEquals(safeReturnTo("http://evil.example"), null);
  assertEquals(safeReturnTo("javascript:alert(1)"), null);
  assertEquals(safeReturnTo("/\\evil.example"), null);
  assertEquals(safeReturnTo("dashboard"), null);
  assertEquals(safeReturnTo(""), null);
  assertEquals(safeReturnTo(null), null);
  assertEquals(safeReturnTo(undefined), null);
});

Deno.test("provider credentials use names Supabase will actually accept", () => {
  // Supabase reserves the SUPABASE_ prefix for Edge Function secrets, so no
  // provider may read a variable under it. Asserting the literal names rather
  // than the pattern is the point: the failure being guarded against is code
  // and docs each deriving a different name with neither checked against the
  // other.
  const names: string[] = [];
  const realGet = Deno.env.get.bind(Deno.env);
  try {
    Deno.env.get = (k: string) => {
      names.push(k);
      return "value";
    };
    providerCredentials("google");
    providerCredentials("posthog");
  } finally {
    Deno.env.get = realGet;
  }

  assertEquals(names, [
    "OAUTH_GOOGLE_CLIENT_ID",
    "OAUTH_GOOGLE_CLIENT_SECRET",
    "OAUTH_POSTHOG_CLIENT_ID",
    "OAUTH_POSTHOG_CLIENT_SECRET",
  ]);
  for (const name of names) {
    assert(!name.startsWith("SUPABASE_"), `${name} uses a reserved prefix`);
  }
});

// --- Token exchange and refresh -------------------------------------------
//
// Everything below drives the registry through a stubbed `fetch`. These are
// the paths where a provider's answer decides whether a connection is created:
// a broker that treats a failed exchange as a success stores a connection
// backed by no token, and a refresh that drops the refresh token bricks the
// connection permanently.

interface Call {
  url: string;
  method: string;
  body: URLSearchParams | null;
}

/**
 * Runs `body` with `fetch` replaced by `route`, collecting the calls made.
 * console.error is silenced because postForToken logs every provider refusal
 * and these tests deliberately cause a lot of them.
 */
async function withFetch(
  route: (url: string, init?: RequestInit) => Response | Promise<Response>,
  body: (calls: Call[]) => Promise<void>,
): Promise<void> {
  const calls: Call[] = [];
  const realFetch = globalThis.fetch;
  const realError = console.error;
  console.error = () => {};
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body instanceof URLSearchParams ? init.body : null,
    });
    return Promise.resolve(route(url, init));
  }) as typeof fetch;
  try {
    await body(calls);
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const EXCHANGE = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUri: "https://api.example.com/functions/v1/connections-callback",
  code: "auth-code-1",
  codeVerifier: "verifier-1",
};

const GITHUB_USER = "https://api.github.com/user";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

/** Answers the label lookups so only the token endpoint is under test. */
function labelOr(tokenResponse: () => Response) {
  return (url: string) => {
    if (url === GITHUB_USER) return json({ login: "octocat" });
    if (url === GOOGLE_USERINFO) return json({ email: "someone@example.com" });
    return tokenResponse();
  };
}

Deno.test("a provider error carried on a 200 is still a failure", async () => {
  // GitHub answers a bad code with HTTP 200 and an `error` field. Reading only
  // the status would store a connection with no usable token.
  await withFetch(
    labelOr(() =>
      json({
        error: "bad_verification_code",
        error_description: "code expired",
      }),
    ),
    async () => {
      const err = await assertRejects(() => driver("github").exchangeCode(EXCHANGE), ApiError);
      assertEquals(err.status, 502);
      assertEquals(err.code, "provider_error");
      // The provider's own message can echo the submitted code back, so it is
      // logged rather than forwarded.
      assert(!err.message.includes("bad_verification_code"));
      assert(!err.message.includes("code expired"));
    },
  );
});

Deno.test("a non-2xx from the token endpoint is a failure", async () => {
  await withFetch(
    labelOr(() => json({ access_token: "should-be-ignored" }, 400)),
    async () => {
      const err = await assertRejects(() => driver("google").exchangeCode(EXCHANGE), ApiError);
      assertEquals(err.status, 502);
      assertEquals(err.code, "provider_error");
    },
  );
});

Deno.test("an unreachable provider is distinguished from a refusing one", async () => {
  await withFetch(
    () => {
      throw new TypeError("connection refused");
    },
    async () => {
      const err = await assertRejects(() => driver("github").exchangeCode(EXCHANGE), ApiError);
      assertEquals(err.status, 502);
      assertEquals(err.code, "provider_unreachable");
    },
  );
});

Deno.test("an unreadable provider response is a failure, not a crash", async () => {
  await withFetch(
    labelOr(() => new Response("<html>502 Bad Gateway</html>", { status: 200 })),
    async () => {
      const err = await assertRejects(() => driver("github").exchangeCode(EXCHANGE), ApiError);
      assertEquals(err.status, 502);
      assertEquals(err.code, "provider_error");
    },
  );
});

Deno.test("a success envelope with no access token creates no connection", async () => {
  // A 200 with a well-formed body but no token must not resolve. If it did,
  // the caller would persist a connection whose token is undefined.
  for (const payload of [{}, { access_token: "" }, { access_token: 12345 }]) {
    for (const slug of OAUTH_SLUGS) {
      await withFetch(
        labelOr(() => json(payload)),
        async () => {
          const err = await assertRejects(() => driver(slug).exchangeCode(EXCHANGE), ApiError);
          assertEquals(err.status, 502);
          assertEquals(err.code, "provider_error");
        },
      );
    }
  }
});

Deno.test("the exchange sends the secret and verifier in the body, never the url", async () => {
  await withFetch(
    labelOr(() => json({ access_token: "gho_x" })),
    async (calls) => {
      await driver("github").exchangeCode(EXCHANGE);
      const token = calls.find((c) => c.method === "POST")!;
      // A secret in a query string lands in access logs and referrers.
      assert(!token.url.includes("secret-1"));
      assert(!token.url.includes("auth-code-1"));
      assertEquals(token.body?.get("client_secret"), "secret-1");
      assertEquals(token.body?.get("code"), "auth-code-1");
      // Without the verifier the exchange is no longer PKCE-bound.
      assertEquals(token.body?.get("code_verifier"), "verifier-1");
      assertEquals(token.body?.get("redirect_uri"), EXCHANGE.redirectUri);
    },
  );
});

Deno.test("github is the one provider whose exchange carries no grant_type", async () => {
  await withFetch(
    labelOr(() => json({ access_token: "gho_x" })),
    async (calls) => {
      await driver("github").exchangeCode(EXCHANGE);
      assertEquals(calls.find((c) => c.method === "POST")!.body?.get("grant_type"), null);
    },
  );
  await withFetch(
    labelOr(() => json({ access_token: "ya29" })),
    async (calls) => {
      await driver("google").exchangeCode(EXCHANGE);
      assertEquals(
        calls.find((c) => c.method === "POST")!.body?.get("grant_type"),
        "authorization_code",
      );
    },
  );
});

Deno.test("a failed profile lookup does not fail an otherwise good connection", async () => {
  // The token is already valid at this point and the handle is cosmetic.
  for (const userResponse of [
    () => json({ message: "Bad credentials" }, 401),
    () => new Response("not json", { status: 200 }),
    () => {
      throw new TypeError("network down");
    },
  ]) {
    await withFetch(
      (url) => (url === GITHUB_USER ? userResponse() : json({ access_token: "gho_x" })),
      async () => {
        const set = await driver("github").exchangeCode(EXCHANGE);
        assertEquals(set.accessToken, "gho_x");
        assertEquals(set.externalAccount, null);
      },
    );
  }
});

Deno.test("slack's user token is lifted out of authed_user", async () => {
  // Slack puts a bot token at the top level and the user token underneath.
  // Taking the top-level one would store a credential that cannot read
  // mentions and looks connected anyway.
  await withFetch(
    () =>
      json({
        access_token: "xoxb-bot-token",
        team: { name: "Magpi HQ" },
        authed_user: {
          id: "U123",
          access_token: "xoxp-user-token",
          scope: "search:read",
        },
      }),
    async () => {
      const set = await driver("slack").exchangeCode(EXCHANGE);
      assertEquals(set.accessToken, "xoxp-user-token");
      assertEquals(set.scopes, ["search:read"]);
      assertEquals(set.externalAccount, "Magpi HQ");
    },
  );
});

Deno.test("granted scopes are read from the provider, not assumed", async () => {
  const cases: Array<[unknown, string[]]> = [
    ["read:user repo", ["read:user", "repo"]],
    ["read:user,repo", ["read:user", "repo"]],
    ["  read:user   repo  ", ["read:user", "repo"]],
    ["", []],
    [undefined, []],
    [null, []],
    [42, []],
  ];
  for (const [scope, expected] of cases) {
    await withFetch(
      labelOr(() => json({ access_token: "t", scope })),
      async () => {
        assertEquals((await driver("github").exchangeCode(EXCHANGE)).scopes, expected);
      },
    );
  }
});

Deno.test("expiry is absent rather than wrong when the provider omits it", async () => {
  // A bogus expiry would either expire a live token or, worse, keep using a
  // dead one. Null means "no known expiry" and the refresh path handles it.
  for (const expiresIn of [undefined, null, "3600", Number.NaN, Number.POSITIVE_INFINITY]) {
    await withFetch(
      labelOr(() => json({ access_token: "t", expires_in: expiresIn })),
      async () => {
        assertEquals((await driver("github").exchangeCode(EXCHANGE)).expiresAt, null);
      },
    );
  }

  await withFetch(
    labelOr(() => json({ access_token: "t", expires_in: 3600 })),
    async () => {
      const before = Date.now();
      const set = await driver("github").exchangeCode(EXCHANGE);
      const at = Date.parse(set.expiresAt!);
      assert(at >= before + 3600 * 1000);
      assert(at <= Date.now() + 3600 * 1000);
    },
  );
});

Deno.test("a refresh that returns no new refresh token keeps the old one", async () => {
  // Providers routinely omit refresh_token on a refresh response. Storing the
  // absent value would end the connection at the next expiry with no way back
  // except a full re-authorization by the user.
  for (const slug of OAUTH_SLUGS) {
    await withFetch(
      () => json({ access_token: "new-access" }),
      async () => {
        const set = await driver(slug).refresh({
          clientId: "c",
          clientSecret: "s",
          refreshToken: "old-refresh",
        });
        assertEquals(set.accessToken, "new-access");
        assertEquals(set.refreshToken, "old-refresh");
      },
    );

    await withFetch(
      () => json({ access_token: "new-access", refresh_token: "rotated" }),
      async () => {
        const set = await driver(slug).refresh({
          clientId: "c",
          clientSecret: "s",
          refreshToken: "old-refresh",
        });
        assertEquals(set.refreshToken, "rotated");
      },
    );
  }
});

Deno.test("a refresh is a grant_type=refresh_token post carrying the old token", async () => {
  await withFetch(
    () => json({ access_token: "new-access" }),
    async (calls) => {
      await driver("google").refresh({
        clientId: "c",
        clientSecret: "s",
        refreshToken: "old",
      });
      assertEquals(calls.length, 1);
      assertEquals(calls[0].method, "POST");
      assertEquals(calls[0].body?.get("grant_type"), "refresh_token");
      assertEquals(calls[0].body?.get("refresh_token"), "old");
      assert(!calls[0].url.includes("old"));
    },
  );
});

Deno.test("a refresh without an access token fails rather than blanking the token", async () => {
  for (const slug of OAUTH_SLUGS) {
    await withFetch(
      () => json({ refresh_token: "rotated" }),
      async () => {
        const err = await assertRejects(
          () =>
            driver(slug).refresh({
              clientId: "c",
              clientSecret: "s",
              refreshToken: "old",
            }),
          ApiError,
        );
        assertEquals(err.status, 502);
        assertEquals(err.code, "provider_error");
      },
    );
  }
});

// --- Configuration ---------------------------------------------------------

/** Runs a body with the given env vars set, restoring the environment after. */
async function withEnv(vars: Record<string, string | null>, body: () => void | Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    previous.set(k, Deno.env.get(k));
    if (v === null) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  try {
    await body();
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("provider credentials come from per-provider environment variables", async () => {
  await withEnv(
    {
      OAUTH_GITHUB_CLIENT_ID: "id-1",
      OAUTH_GITHUB_CLIENT_SECRET: "secret-1",
    },
    () => {
      assertEquals(providerCredentials("github"), {
        clientId: "id-1",
        clientSecret: "secret-1",
      });
    },
  );
});

Deno.test("an unconfigured provider is a 503, not a call with empty credentials", async () => {
  // 503 says "this deployment has not been given the secret yet". Proceeding
  // with an empty client_secret would instead look like a provider outage.
  for (const missing of [
    { OAUTH_GITHUB_CLIENT_ID: null, OAUTH_GITHUB_CLIENT_SECRET: "s" },
    { OAUTH_GITHUB_CLIENT_ID: "id", OAUTH_GITHUB_CLIENT_SECRET: null },
    { OAUTH_GITHUB_CLIENT_ID: null, OAUTH_GITHUB_CLIENT_SECRET: null },
    { OAUTH_GITHUB_CLIENT_ID: "", OAUTH_GITHUB_CLIENT_SECRET: "s" },
  ]) {
    await withEnv(missing, () => {
      const err = assertThrows(() => providerCredentials("github"), ApiError);
      assertEquals(err.status, 503);
      assertEquals(err.code, "provider_unconfigured");
    });
  }
});

Deno.test("the callback url refuses to guess when SUPABASE_URL is unset", async () => {
  await withEnv({ SUPABASE_URL: null }, () => {
    const err = assertThrows(() => callbackUrl(), ApiError);
    assertEquals(err.status, 500);
    assertEquals(err.code, "misconfigured");
  });
});

Deno.test("the callback url is the public origin, not the internal gateway", async () => {
  // Inside the edge runtime SUPABASE_URL is http://kong:8000. A redirect_uri
  // naming a container hostname is one no provider can send a browser to,
  // which is exactly what Google and Linear rejected.
  await withEnv(
    {
      SUPABASE_URL: "http://kong:8000",
      FUNCTIONS_BASE_URL: "http://127.0.0.1:56521/functions/v1",
    },
    () => {
      assertEquals(callbackUrl(), "http://127.0.0.1:56521/functions/v1/connections-callback");
      return Promise.resolve();
    },
  );
});

Deno.test("the callback url falls back to SUPABASE_URL where they are the same host", async () => {
  await withEnv(
    {
      SUPABASE_URL: "https://proj.supabase.co",
      FUNCTIONS_BASE_URL: null,
    },
    () => {
      assertEquals(callbackUrl(), "https://proj.supabase.co/functions/v1/connections-callback");
      return Promise.resolve();
    },
  );
});

Deno.test("a trailing slash on the public origin does not double up", async () => {
  await withEnv(
    {
      FUNCTIONS_BASE_URL: "https://proj.supabase.co/functions/v1/",
    },
    () => {
      assertEquals(callbackUrl(), "https://proj.supabase.co/functions/v1/connections-callback");
      return Promise.resolve();
    },
  );
});
