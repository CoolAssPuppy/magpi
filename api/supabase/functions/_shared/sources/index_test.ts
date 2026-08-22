import { assertEquals, assertInstanceOf } from "@std/assert";
import * as sources from "./index.ts";

Deno.test("index carries every client function a page builder needs", () => {
  // Naming each one keeps a dropped re-export a compile error as well as a
  // test failure.
  const clients: Record<string, unknown> = {
    nextEvents: sources.nextEvents,
    dayShape: sources.dayShape,
    unreadCount: sources.unreadCount,
    deployments: sources.deployments,
    assignedIssues: sources.assignedIssues,
    mentions: sources.mentions,
    reviewRequests: sources.reviewRequests,
    insight: sources.insight,
  };

  for (const [name, client] of Object.entries(clients)) {
    assertEquals(typeof client, "function", name);
  }
});

Deno.test("index carries SourceError so a caller can tell a refusal apart", () => {
  const error = new sources.SourceError("google", "reconnect google", true);
  assertInstanceOf(error, Error);
  assertEquals(error.provider, "google");
  assertEquals(error.needsReconnect, true);
});
