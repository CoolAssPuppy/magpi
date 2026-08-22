import { assert, assertEquals, assertRejects } from "@std/assert";
import { SPARK_POINTS } from "../badge-constants.ts";
import { SourceError } from "./contract.ts";
import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { insight } from "./posthog.ts";

const TOKEN = "phx_fixture_posthog_personal_key";
const NOW = new Date("2026-08-22T15:00:00Z");

interface Reply {
  status?: number;
  body?: unknown;
  text?: string;
}

interface Stub {
  fetch: typeof fetch;
  urls: string[];
}

function stub(...replies: Reply[]): Stub {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = (input) => {
    urls.push(String(input));
    const reply = replies[Math.min(urls.length - 1, replies.length - 1)] ?? {};
    return Promise.resolve(
      new Response(reply.text ?? JSON.stringify(reply.body ?? {}), {
        status: reply.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { fetch: fetchImpl, urls };
}

function creds(meta: Record<string, unknown> = {}): ProviderCredentials {
  return {
    accessToken: TOKEN,
    meta: {
      host: "https://us.posthog.com/",
      project_id: "42",
      insight_id: "abc123",
      ...meta,
    },
  };
}

function deps(stubbed: Stub): FetchDeps {
  return { fetch: stubbed.fetch, now: NOW, timeZone: "UTC" };
}

Deno.test("insight reads the latest point, the spark, and the change across it", async () => {
  const stubbed = stub({
    body: {
      name: "Signups today",
      last_refresh: "2026-08-22T14:56:00Z",
      result: [{ label: "signups", data: [10, 12, 15] }],
    },
  });

  assertEquals(await insight(creds(), deps(stubbed)), {
    label: "Signups today",
    value: 15,
    unit: null,
    spark: [10, 12, 15],
    deltaPct: 50,
    updated: "4m ago",
  });
});

Deno.test("insight builds the project insight url from the connection meta", async () => {
  const stubbed = stub({ body: { result: [{ data: [1] }] } });
  await insight(creds({ host: "eu.posthog.com" }), deps(stubbed));
  assertEquals(stubbed.urls[0], "https://eu.posthog.com/api/projects/42/insights/abc123/");
});

Deno.test("insight keeps only the most recent SPARK_POINTS", async () => {
  const data = Array.from({ length: SPARK_POINTS + 10 }, (_unused, index) => index);
  const reading = await insight(creds(), deps(stub({ body: { result: [{ data }] } })));

  assertEquals(reading.spark.length, SPARK_POINTS);
  assertEquals(reading.spark[0], 10);
  assertEquals(reading.spark[SPARK_POINTS - 1], SPARK_POINTS + 9);
  assertEquals(reading.value, SPARK_POINTS + 9);
  // The change is measured across the window shown, not across the whole series.
  assertEquals(reading.deltaPct, 290);
});

Deno.test("insight reports no change when the window opens at zero", async () => {
  const reading = await insight(creds(), deps(stub({ body: { result: [{ data: [0, 5, 9] }] } })));
  assertEquals(reading.value, 9);
  assertEquals(reading.deltaPct, null);
});

Deno.test("insight measures a fall as a negative percentage", async () => {
  const reading = await insight(creds(), deps(stub({ body: { result: [{ data: [80, 60] }] } })));
  assertEquals(reading.deltaPct, -25);
});

Deno.test("insight falls back to the series label and then to the provider", async () => {
  const labelled = await insight(
    creds(),
    deps(stub({ body: { result: [{ label: "pageviews", data: [1] }] } })),
  );
  assertEquals(labelled.label, "pageviews");

  const unlabelled = await insight(creds(), deps(stub({ body: { result: [{ data: [1] }] } })));
  assertEquals(unlabelled.label, "posthog");
});

Deno.test("insight ages the reading against the wearer's clock", async () => {
  const reading = await insight(
    creds(),
    deps(stub({ body: { last_modified_at: "2026-08-22T12:00:00Z", result: [{ data: [1] }] } })),
  );
  assertEquals(reading.updated, "3h ago");
});

Deno.test("insight gives an empty reading for a malformed body", async () => {
  assertEquals(await insight(creds(), deps(stub({ text: "<html>" }))), {
    label: "posthog",
    value: 0,
    unit: null,
    spark: [],
    deltaPct: null,
    updated: "now",
  });

  const wrongTypes = await insight(
    creds(),
    deps(stub({ body: { name: 7, result: [{ data: [1, "two", null, 4] }] } })),
  );
  assertEquals(wrongTypes.spark, [1, 0, 0, 4]);
  assertEquals(wrongTypes.label, "posthog");
});

Deno.test("insight says what to configure when the connection is incomplete", async () => {
  for (const meta of [{ host: "" }, { host: "   " }, { project_id: "" }, { insight_id: "" }]) {
    const stubbed = stub({ body: {} });
    const error = await assertRejects(() => insight(creds(meta), deps(stubbed)), SourceError);
    assertEquals(error.provider, "posthog");
    assertEquals(error.needsReconnect, false);
    assert(error.message.includes("posthog"));
    // Nothing is asked of posthog until it is known where to ask.
    assertEquals(stubbed.urls.length, 0);
  }
});

Deno.test("insight asks for a reconnect on 401 and says nothing about the token", async () => {
  const stubbed = stub({ status: 401, body: { detail: `key ${TOKEN} is invalid` } });
  const error = await assertRejects(() => insight(creds(), deps(stubbed)), SourceError);
  assertEquals(error.needsReconnect, true);
  assert(!error.message.includes(TOKEN));
});

Deno.test("insight does not ask for a reconnect on 500", async () => {
  const error = await assertRejects(
    () => insight(creds(), deps(stub({ status: 500 }))),
    SourceError,
  );
  assertEquals(error.needsReconnect, false);
  assert(!error.message.includes(TOKEN));
});
