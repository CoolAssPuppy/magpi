import { assert, assertEquals } from "@std/assert";

import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { SourceError } from "./contract.ts";
import {
  assignedIssues,
  dayShape,
  deployments,
  insight,
  mentions,
  nextEvents,
  reviewRequests,
  unreadCount,
} from "./index.ts";

/**
 * A token must never reach a message.
 *
 * Every SourceError message is shown to the wearer on the badge and written to
 * a log, so a client that interpolated the credential it was handed would put
 * a live secret in both. The clients are written not to; this is what keeps it
 * that way when one of them is edited.
 */

const SECRET = "tok_hUnTr2_do_not_leak_me_9f3a";
const SECRET_FRAGMENT = "hUnTr2";

const CREDENTIALS: ProviderCredentials = {
  accessToken: SECRET,
  meta: {
    host: "us.posthog.com",
    project_id: "64213",
    insight_id: "aX9k2Lp",
    team_id: SECRET,
  },
};

function depsAnswering(status: number): FetchDeps {
  return {
    fetch: () =>
      Promise.resolve(
        new Response(status === 200 ? "not json at all" : JSON.stringify({ error: SECRET }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    now: new Date("2026-08-22T10:14:00Z"),
    timeZone: "Europe/Lisbon",
  };
}

function depsThatReject(): FetchDeps {
  return {
    fetch: () => Promise.reject(new Error(`connect failed to https://x/?token=${SECRET}`)),
    now: new Date("2026-08-22T10:14:00Z"),
    timeZone: "Europe/Lisbon",
  };
}

const CALLS: { name: string; run: (deps: FetchDeps) => Promise<unknown> }[] = [
  {
    name: "google.nextEvents",
    run: (deps) =>
      nextEvents(CREDENTIALS, deps, {
        calendarId: "primary",
        lookAheadHours: 12,
        skipAllDay: true,
        limit: 3,
      }),
  },
  {
    name: "google.dayShape",
    run: (deps) => dayShape(CREDENTIALS, deps, { calendarId: "primary", forTomorrow: false }),
  },
  {
    name: "google.unreadCount",
    run: (deps) => unreadCount(CREDENTIALS, deps, { query: "is:unread" }),
  },
  {
    name: "vercel.deployments",
    run: (deps) => deployments(CREDENTIALS, deps, { teamId: SECRET, limit: 4 }),
  },
  { name: "linear.assignedIssues", run: (deps) => assignedIssues(CREDENTIALS, deps) },
  { name: "slack.mentions", run: (deps) => mentions(CREDENTIALS, deps) },
  { name: "github.reviewRequests", run: (deps) => reviewRequests(CREDENTIALS, deps) },
  { name: "posthog.insight", run: (deps) => insight(CREDENTIALS, deps) },
];

async function messageFrom(
  run: (deps: FetchDeps) => Promise<unknown>,
  deps: FetchDeps,
): Promise<string> {
  try {
    await run(deps);
    return "";
  } catch (error) {
    // The whole error, not just its message: a stack or a cause carrying the
    // request URL would leak just as well.
    return error instanceof Error
      ? `${error.name} ${error.message} ${error.stack ?? ""} ${String(
          (error as { cause?: unknown }).cause ?? "",
        )}`
      : String(error);
  }
}

for (const call of CALLS) {
  Deno.test(`${call.name} never puts the token in a 401 message`, async () => {
    const message = await messageFrom(call.run, depsAnswering(401));
    assert(!message.includes(SECRET), `${call.name} leaked the whole token`);
    assert(!message.includes(SECRET_FRAGMENT), `${call.name} leaked part of the token`);
  });

  Deno.test(`${call.name} never puts the token in a 500 message`, async () => {
    const message = await messageFrom(call.run, depsAnswering(500));
    assert(!message.includes(SECRET_FRAGMENT), `${call.name} leaked part of the token`);
  });

  Deno.test(`${call.name} never puts the token in a transport failure`, async () => {
    const message = await messageFrom(call.run, depsThatReject());
    assert(!message.includes(SECRET_FRAGMENT), `${call.name} leaked part of the token`);
  });
}

Deno.test("a refused credential asks the wearer to reconnect", async () => {
  for (const call of CALLS) {
    try {
      await call.run(depsAnswering(401));
      throw new Error(`${call.name} did not raise on a 401`);
    } catch (error) {
      assert(error instanceof SourceError, `${call.name} raised something else`);
      assertEquals(error.needsReconnect, true, `${call.name} did not ask for a reconnect`);
    }
  }
});

Deno.test("a server fault does not ask the wearer to reconnect", async () => {
  for (const call of CALLS) {
    try {
      await call.run(depsAnswering(500));
      throw new Error(`${call.name} did not raise on a 500`);
    } catch (error) {
      assert(error instanceof SourceError, `${call.name} raised something else`);
      assertEquals(error.needsReconnect, false, `${call.name} asked for a needless reconnect`);
    }
  }
});
