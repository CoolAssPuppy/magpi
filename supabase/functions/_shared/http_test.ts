import { assertEquals } from "@std/assert";

import { clientIp, corsHeadersFor, handleOptions, toCoreRequest } from "./http.ts";
import { envSource } from "./testing/assertions.ts";

Deno.test("the client ip is the rightmost forwarded entry", () => {
  // The leftmost is client-supplied, so reading it lets a caller present a
  // fresh ip per request and never reach a limit.
  const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" });
  assertEquals(clientIp(headers), "3.3.3.3");
});

Deno.test("a request with no forwarding headers reads as unknown", () => {
  assertEquals(clientIp(new Headers()), "unknown");
});

Deno.test("the path is what follows the function name", async () => {
  const core = await toCoreRequest(
    new Request("https://p.supabase.co/functions/v1/ingest-worker/run?limit=5", {
      method: "POST",
      body: JSON.stringify({ batch: 3 }),
    }),
    "ingest-worker",
  );
  assertEquals(core.path, "/run");
  assertEquals(core.method, "POST");
  assertEquals(core.query.get("limit"), "5");
  assertEquals(core.body, { batch: 3 });
});

Deno.test("a body that is not json reads as null rather than throwing", async () => {
  const core = await toCoreRequest(
    new Request("https://p.supabase.co/functions/v1/x", { method: "POST", body: "not json" }),
    "x",
  );
  assertEquals(core.body, null);
});

Deno.test("an allowed origin is echoed back and a disallowed one is not", () => {
  const source = envSource({ SB_WEB_ORIGINS: "https://recall.dev,https://staging.recall.dev" });
  const allowed = corsHeadersFor(new Headers({ origin: "https://recall.dev" }), source);
  assertEquals(allowed["Access-Control-Allow-Origin"], "https://recall.dev");

  const refused = corsHeadersFor(new Headers({ origin: "https://evil.example" }), source);
  assertEquals(refused["Access-Control-Allow-Origin"], undefined);
});

Deno.test("cors varies on origin so a cache cannot cross-serve a response", () => {
  const headers = corsHeadersFor(new Headers(), envSource({}));
  assertEquals(headers["Vary"], "Origin");
});

Deno.test("preflight is answered with 204 and nothing else is", () => {
  const options = handleOptions(
    new Request("https://p.supabase.co/x", { method: "OPTIONS" }),
    envSource({}),
  );
  assertEquals(options?.status, 204);
  assertEquals(handleOptions(new Request("https://p.supabase.co/x"), envSource({})), null);
});
