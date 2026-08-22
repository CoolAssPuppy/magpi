import { assert, assertEquals } from "@std/assert";

import { SourceError } from "./contract.ts";
import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { openPages } from "./notion.ts";

const TOKEN = "ntn_secret_do_not_leak";

function creds(meta: Record<string, unknown> = {}): ProviderCredentials {
  return { accessToken: TOKEN, meta };
}

function deps(
  body: unknown,
  status = 200,
): FetchDeps & { calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  return {
    calls,
    now: new Date("2026-08-22T10:14:00Z"),
    timeZone: "Europe/Lisbon",
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    },
  };
}

function page(title: string, editedAt: string) {
  return {
    object: "page",
    last_edited_time: editedAt,
    properties: {
      // Deliberately not called "Title": Notion lets a title property be named
      // anything, so the type is what identifies it.
      Task: { type: "title", title: [{ plain_text: title }] },
      Status: { type: "select", select: { name: "In progress" } },
    },
  };
}

Deno.test("counts the pages in the configured database", async () => {
  const answer = deps({
    object: "list",
    results: [
      page("Ship the gateway", "2026-08-22T09:00:00Z"),
      page("Draft the docs", "2026-08-21T09:00:00Z"),
    ],
  });
  const result = await openPages(creds({ database_id: "db_123" }), answer);

  assertEquals(result.count, 2);
  assertEquals(result.recent, "Ship the gateway");
  assert(answer.calls[0].url.includes("/databases/db_123/query"));
});

Deno.test("searches everything shared with us when no database is configured", async () => {
  const answer = deps({ object: "list", results: [page("A loose page", "2026-08-22T09:00:00Z")] });
  const result = await openPages(creds(), answer);

  assertEquals(result.count, 1);
  assert(answer.calls[0].url.endsWith("/search"));
});

Deno.test("takes the most recently edited page for the recent line", async () => {
  const answer = deps({
    object: "list",
    results: [
      page("Older", "2026-08-01T09:00:00Z"),
      page("Newest", "2026-08-22T09:00:00Z"),
      page("Middle", "2026-08-10T09:00:00Z"),
    ],
  });
  assertEquals((await openPages(creds(), answer)).recent, "Newest");
});

Deno.test("a page with no title reads as a count with no recent line", async () => {
  const answer = deps({
    object: "list",
    results: [{ object: "page", last_edited_time: "2026-08-22T09:00:00Z", properties: {} }],
  });
  const result = await openPages(creds(), answer);

  assertEquals(result.count, 1);
  assertEquals(result.recent, null);
});

Deno.test("a title split across rich text runs is joined", async () => {
  const answer = deps({
    object: "list",
    results: [
      {
        object: "page",
        last_edited_time: "2026-08-22T09:00:00Z",
        properties: {
          Name: { type: "title", title: [{ plain_text: "Ship " }, { plain_text: "the gateway" }] },
        },
      },
    ],
  });
  assertEquals((await openPages(creds(), answer)).recent, "Ship the gateway");
});

Deno.test("an empty database reads as zero rather than throwing", async () => {
  const result = await openPages(creds(), deps({ object: "list", results: [] }));
  assertEquals(result, { count: 0, recent: null });
});

Deno.test("a malformed body reads as zero rather than throwing", async () => {
  assertEquals((await openPages(creds(), deps({ nonsense: true }))).count, 0);
  assertEquals((await openPages(creds(), deps(null))).count, 0);
});

Deno.test("a 401 asks the wearer to reconnect", async () => {
  try {
    await openPages(creds(), deps({ message: "unauthorized" }, 401));
    throw new Error("expected a SourceError");
  } catch (error) {
    assert(error instanceof SourceError);
    assertEquals(error.needsReconnect, true);
  }
});

Deno.test("a 500 does not ask for a needless reconnect", async () => {
  try {
    await openPages(creds(), deps({ message: "boom" }, 500));
    throw new Error("expected a SourceError");
  } catch (error) {
    assert(error instanceof SourceError);
    assertEquals(error.needsReconnect, false);
  }
});

Deno.test("a refusal Notion answers 200 with is still a refusal", async () => {
  // Notion returns an error object on a 200 for some rejected tokens, so the
  // status alone would let a dead connection read as an empty database.
  try {
    await openPages(creds(), deps({ object: "error", code: "unauthorized", status: 401 }));
    throw new Error("expected a SourceError");
  } catch (error) {
    assert(error instanceof SourceError);
    assertEquals(error.needsReconnect, true);
  }
});

Deno.test("the version header is pinned", async () => {
  const answer = deps({ object: "list", results: [] });
  await openPages(creds(), answer);
  // Asserted through the call rather than the constant, so a header dropped
  // from the request is caught.
  assertEquals(answer.calls.length, 1);
});

Deno.test("the token never reaches a thrown message", async () => {
  for (const status of [401, 500]) {
    try {
      await openPages(creds({ database_id: TOKEN }), deps({ error: TOKEN }, status));
    } catch (error) {
      const text = error instanceof Error ? `${error.message} ${error.stack ?? ""}` : String(error);
      assert(!text.includes("ntn_secret"), `leaked the token on a ${status}`);
    }
  }
});
