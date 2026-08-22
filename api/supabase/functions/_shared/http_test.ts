import { assertEquals } from "@std/assert";
import { clientIp, handleOptions, toCoreRequest, withCors } from "./http.ts";

Deno.test("clientIp takes the nearest-proxy x-forwarded-for entry", () => {
  // Rightmost, not leftmost. Each proxy appends, so only the last entry was
  // written by infrastructure we control.
  const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
  assertEquals(clientIp(h), "5.6.7.8");
});

Deno.test("clientIp cannot be spoofed by a client-supplied x-forwarded-for", () => {
  // An attacker prepends a fake IP hoping to reset their rate-limit bucket.
  // The real IP is still the one the proxy appended, so the bucket holds.
  const spoofed = new Headers({
    "x-forwarded-for": "203.0.113.9, 198.51.100.7, 5.6.7.8",
  });
  assertEquals(clientIp(spoofed), "5.6.7.8");

  // Rotating the forged prefix must not change the identity we limit on.
  const rotated = new Headers({ "x-forwarded-for": "10.0.0.1, 5.6.7.8" });
  assertEquals(clientIp(rotated), clientIp(spoofed));
});

Deno.test("clientIp ignores empty and whitespace-only entries", () => {
  const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, , " });
  assertEquals(clientIp(h), "5.6.7.8");
});

Deno.test("clientIp falls back to cf-connecting-ip then unknown", () => {
  assertEquals(clientIp(new Headers({ "cf-connecting-ip": "9.9.9.9" })), "9.9.9.9");
  assertEquals(clientIp(new Headers()), "unknown");
});

Deno.test("toCoreRequest strips the function prefix and parses body", async () => {
  const req = new Request(
    "https://proj.supabase.co/functions/v1/connections-claim/ticket/abc?x=1",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 1 }),
    },
  );
  const core = await toCoreRequest(req, "connections-claim");
  assertEquals(core.method, "PUT");
  assertEquals(core.path, "/ticket/abc");
  assertEquals(core.query.get("x"), "1");
  assertEquals(core.body, { value: 1 });
});

Deno.test("toCoreRequest yields null body for invalid JSON and / for bare path", async () => {
  const req = new Request("https://x/functions/v1/device-poll", {
    method: "POST",
    body: "not json",
  });
  const core = await toCoreRequest(req, "device-poll");
  assertEquals(core.body, null);
  assertEquals(core.path, "/");
});

const ALLOWED = "http://localhost:3001";

function reqFrom(origin: string | null, method = "GET"): Request {
  const headers = origin ? { origin } : undefined;
  return new Request("https://x/functions/v1/connections-claim", { method, headers });
}

Deno.test("handleOptions answers preflight and passes others through", () => {
  const pre = handleOptions(reqFrom(ALLOWED, "OPTIONS"));
  assertEquals(pre?.status, 204);
  assertEquals(pre?.headers.get("Access-Control-Allow-Origin"), ALLOWED);
  assertEquals(handleOptions(reqFrom(ALLOWED)), null);
});

Deno.test("cors reflects only allowlisted origins, never a wildcard", () => {
  const allowed = withCors(new Response("{}"), reqFrom(ALLOWED));
  assertEquals(allowed.headers.get("Access-Control-Allow-Origin"), ALLOWED);

  // An attacker's origin gets no ACAO at all, so the browser withholds the
  // response body from their page. A wildcard here would hand it over.
  const evil = withCors(new Response("{}"), reqFrom("https://evil.example"));
  assertEquals(evil.headers.get("Access-Control-Allow-Origin"), null);

  // Server-to-server callers send no Origin and are unaffected either way.
  const noOrigin = withCors(new Response("{}"), reqFrom(null));
  assertEquals(noOrigin.headers.get("Access-Control-Allow-Origin"), null);

  // Caches must not serve one origin's response to another.
  assertEquals(allowed.headers.get("Vary"), "Origin");
});

Deno.test("withCors adds cors headers without clobbering existing", async () => {
  const res = withCors(
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    reqFrom(ALLOWED),
  );
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), ALLOWED);
  assertEquals(res.headers.get("content-type"), "application/json");
  assertEquals(await res.text(), "{}");
});

// Every CORS test above runs on the localhost defaults, which is the one
// configuration production never uses. WEB_ORIGINS is what ships, so the
// parsing of it and the dropping of the defaults are checked here.

/** Runs a body with WEB_ORIGINS set, restoring the environment after. */
function withWebOrigins(value: string | null, body: () => void): void {
  const previous = Deno.env.get("WEB_ORIGINS");
  if (value === null) Deno.env.delete("WEB_ORIGINS");
  else Deno.env.set("WEB_ORIGINS", value);
  try {
    body();
  } finally {
    if (previous === undefined) Deno.env.delete("WEB_ORIGINS");
    else Deno.env.set("WEB_ORIGINS", previous);
  }
}

function allowedOriginFor(origin: string): string | null {
  return withCors(new Response("{}"), reqFrom(origin)).headers.get("Access-Control-Allow-Origin");
}

Deno.test("WEB_ORIGINS replaces the localhost defaults rather than adding to them", () => {
  withWebOrigins("https://magpi.example.com", () => {
    assertEquals(allowedOriginFor("https://magpi.example.com"), "https://magpi.example.com");
    // A production deployment that still trusts localhost lets anything
    // running on a developer's machine read authenticated responses.
    assertEquals(allowedOriginFor("http://localhost:3001"), null);
    assertEquals(allowedOriginFor("http://127.0.0.1:3001"), null);
  });
});

Deno.test("WEB_ORIGINS is a comma-separated list tolerant of surrounding space", () => {
  withWebOrigins(" https://a.example.com , https://b.example.com ,, ", () => {
    assertEquals(allowedOriginFor("https://a.example.com"), "https://a.example.com");
    assertEquals(allowedOriginFor("https://b.example.com"), "https://b.example.com");
    assertEquals(allowedOriginFor("https://c.example.com"), null);
    // An empty entry from a trailing comma must not become an allowed origin.
    assertEquals(allowedOriginFor(""), null);
  });
});

Deno.test("origin matching is exact, not a prefix or suffix test", () => {
  withWebOrigins("https://magpi.example.com", () => {
    for (const impostor of [
      "https://magpi.example.com.evil.test",
      "https://evil.test/https://magpi.example.com",
      "https://magpi.example.com:8443",
      "http://magpi.example.com",
      "https://sub.magpi.example.com",
    ]) {
      assertEquals(allowedOriginFor(impostor), null, `${impostor} must not be allowed`);
    }
  });
});

Deno.test("an empty WEB_ORIGINS falls back to the localhost defaults", () => {
  // Set-but-empty is a deployment mistake. Falling back to localhost keeps
  // development working and still grants no production origin.
  withWebOrigins("", () => {
    assertEquals(allowedOriginFor("http://localhost:3001"), "http://localhost:3001");
    assertEquals(allowedOriginFor("https://magpi.example.com"), null);
  });
});
