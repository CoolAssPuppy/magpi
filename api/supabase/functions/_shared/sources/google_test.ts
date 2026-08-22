import { assert, assertEquals, assertRejects } from "@std/assert";
import { DAY_BLOCKS } from "../badge-constants.ts";
import { SourceError } from "./contract.ts";
import type { FetchDeps, ProviderCredentials } from "./contract.ts";
import { dayShape, nextEvents, unreadCount } from "./google.ts";

const TOKEN = "ya29.fixture-google-access-token";
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

/** Replies are consumed in order; the last one answers every further call. */
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

const creds: ProviderCredentials = { accessToken: TOKEN, meta: {} };

function deps(stubbed: Stub, timeZone = "UTC"): FetchDeps {
  return { fetch: stubbed.fetch, now: NOW, timeZone };
}

const EVENTS = {
  items: [
    {
      summary: "Standup",
      location: "Room 2",
      start: { dateTime: "2026-08-22T15:30:00Z" },
      end: { dateTime: "2026-08-22T15:45:00Z" },
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    },
    {
      summary: "Design review\nbring the mocks",
      start: { dateTime: "2026-08-22T17:00:00Z" },
      end: { dateTime: "2026-08-22T18:00:00Z" },
      conferenceData: { conferenceSolution: { name: "Zoom Meeting" } },
    },
    {
      summary: "Public holiday",
      start: { date: "2026-08-22" },
      end: { date: "2026-08-23" },
    },
  ],
};

const NEXT_OPTIONS = {
  calendarId: "primary",
  lookAheadHours: 12,
  skipAllDay: true,
  limit: 5,
};

Deno.test("nextEvents shapes timed events oldest first", async () => {
  const stubbed = stub({ body: EVENTS });
  const events = await nextEvents(creds, deps(stubbed), NEXT_OPTIONS);

  assertEquals(events, [
    {
      title: "Standup",
      start: "15:30",
      end: "15:45",
      location: "Room 2",
      conferencing: "MEET",
      minutesUntil: 30,
      allDay: false,
    },
    {
      title: "Design review",
      start: "17:00",
      end: "18:00",
      location: null,
      conferencing: "ZOOM",
      minutesUntil: 120,
      allDay: false,
    },
  ]);
});

Deno.test("nextEvents asks for expanded events in start order over the window", async () => {
  const stubbed = stub({ body: EVENTS });
  await nextEvents(creds, deps(stubbed), NEXT_OPTIONS);

  const url = new URL(stubbed.urls[0]);
  assertEquals(url.pathname, "/calendar/v3/calendars/primary/events");
  assertEquals(url.searchParams.get("singleEvents"), "true");
  assertEquals(url.searchParams.get("orderBy"), "startTime");
  assertEquals(url.searchParams.get("timeMin"), "2026-08-22T15:00:00.000Z");
  assertEquals(url.searchParams.get("timeMax"), "2026-08-23T03:00:00.000Z");
});

Deno.test("nextEvents keeps all-day events when asked, with a negative countdown", async () => {
  const stubbed = stub({ body: EVENTS });
  const events = await nextEvents(creds, deps(stubbed), { ...NEXT_OPTIONS, skipAllDay: false });

  assertEquals(events.length, 3);
  assertEquals(events[0], {
    title: "Public holiday",
    start: "00:00",
    end: "23:59",
    location: null,
    conferencing: null,
    minutesUntil: -900,
    allDay: true,
  });
});

Deno.test("nextEvents honours the limit", async () => {
  const stubbed = stub({ body: EVENTS });
  const events = await nextEvents(creds, deps(stubbed), { ...NEXT_OPTIONS, limit: 1 });
  assertEquals(
    events.map((event) => event.title),
    ["Standup"],
  );
});

Deno.test("nextEvents makes no request for a limit of zero", async () => {
  const stubbed = stub({ body: EVENTS });
  assertEquals(await nextEvents(creds, deps(stubbed), { ...NEXT_OPTIONS, limit: 0 }), []);
  assertEquals(stubbed.urls.length, 0);
});

Deno.test("nextEvents renders the wearer's clock, not UTC", async () => {
  const stubbed = stub({ body: EVENTS });
  const events = await nextEvents(creds, deps(stubbed, "America/New_York"), NEXT_OPTIONS);
  assertEquals(events[0].start, "11:30");
  assertEquals(events[0].end, "11:45");
});

Deno.test("nextEvents survives a malformed body and unreadable events", async () => {
  assertEquals(await nextEvents(creds, deps(stub({ text: "<html>nope" })), NEXT_OPTIONS), []);
  assertEquals(await nextEvents(creds, deps(stub({ body: { items: "nope" } })), NEXT_OPTIONS), []);
  assertEquals(
    await nextEvents(
      creds,
      deps(stub({ body: { items: [null, {}, { start: {} }] } })),
      NEXT_OPTIONS,
    ),
    [],
  );
});

Deno.test("nextEvents asks for a reconnect on 401 and says nothing about the token", async () => {
  const stubbed = stub({ status: 401, body: { error: { message: `bad token ${TOKEN}` } } });
  const error = await assertRejects(
    () => nextEvents(creds, deps(stubbed), NEXT_OPTIONS),
    SourceError,
  );
  assertEquals(error.provider, "google");
  assertEquals(error.needsReconnect, true);
  assert(!error.message.includes(TOKEN));
});

Deno.test("nextEvents does not ask for a reconnect on 500", async () => {
  const stubbed = stub({ status: 500, body: { error: "boom" } });
  const error = await assertRejects(
    () => nextEvents(creds, deps(stubbed), NEXT_OPTIONS),
    SourceError,
  );
  assertEquals(error.needsReconnect, false);
  assert(!error.message.includes(TOKEN));
});

Deno.test("nextEvents turns a transport failure into a source error", async () => {
  const failing: FetchDeps = {
    fetch: () => Promise.reject(new Error(`connect failed for ${TOKEN}`)),
    now: NOW,
    timeZone: "UTC",
  };
  const error = await assertRejects(() => nextEvents(creds, failing, NEXT_OPTIONS), SourceError);
  assertEquals(error.needsReconnect, false);
  assert(!error.message.includes(TOKEN));
});

// -- dayShape ----------------------------------------------------------------

const DAY_OPTIONS = { calendarId: "primary", forTomorrow: false };

const DAY_EVENTS = {
  items: [
    // 09:00 to 10:00 fills its hour.
    {
      summary: "Interview",
      start: { dateTime: "2026-08-22T09:00:00Z" },
      end: { dateTime: "2026-08-22T10:00:00Z" },
    },
    // 11:00 to 11:30 is half of its hour.
    {
      summary: "Sync",
      start: { dateTime: "2026-08-22T11:00:00Z" },
      end: { dateTime: "2026-08-22T11:30:00Z" },
    },
    // 12:00 to 12:10 is a sliver, which still counts as booked.
    {
      summary: "Standup",
      start: { dateTime: "2026-08-22T12:00:00Z" },
      end: { dateTime: "2026-08-22T12:10:00Z" },
    },
    // An all-day event says nothing about how booked the day is.
    { summary: "Conference", start: { date: "2026-08-22" }, end: { date: "2026-08-23" } },
  ],
};

Deno.test("dayShape grades each hour by how much of it is booked", async () => {
  const shape = await dayShape(creds, deps(stub({ body: DAY_EVENTS })), DAY_OPTIONS);

  assertEquals(shape.blocks.length, DAY_BLOCKS);
  // Blocks start at DAY_START_HOUR, so 09:00 is block 2.
  assertEquals(shape.blocks[2], 3);
  assertEquals(shape.blocks[3], 0);
  assertEquals(shape.blocks[4], 2);
  assertEquals(shape.blocks[5], 1);
  assertEquals(shape.meetingCount, 3);
  assertEquals(shape.freeMinutes, DAY_BLOCKS * 60 - 100);
  assertEquals(shape.currentHour, 15);
});

Deno.test("dayShape reads the window from DAY_START_HOUR on the wearer's day", async () => {
  const stubbed = stub({ body: DAY_EVENTS });
  await dayShape(creds, deps(stubbed), DAY_OPTIONS);
  const url = new URL(stubbed.urls[0]);
  assertEquals(url.searchParams.get("timeMin"), "2026-08-22T07:00:00.000Z");
  assertEquals(url.searchParams.get("timeMax"), "2026-08-23T07:00:00.000Z");
});

Deno.test("dayShape moves the whole window for tomorrow", async () => {
  const stubbed = stub({ body: DAY_EVENTS });
  const shape = await dayShape(creds, deps(stubbed), { ...DAY_OPTIONS, forTomorrow: true });
  const url = new URL(stubbed.urls[0]);
  assertEquals(url.searchParams.get("timeMin"), "2026-08-23T07:00:00.000Z");
  // Yesterday's meetings fall outside the window entirely.
  assertEquals(shape.meetingCount, 0);
  assertEquals(shape.blocks, new Array<number>(DAY_BLOCKS).fill(0));
});

Deno.test("dayShape counts a wearer in another zone against their own clock", async () => {
  const stubbed = stub({ body: DAY_EVENTS });
  const shape = await dayShape(creds, deps(stubbed, "America/New_York"), DAY_OPTIONS);
  // 07:00 New York on 22 August is 11:00 UTC.
  assertEquals(new URL(stubbed.urls[0]).searchParams.get("timeMin"), "2026-08-22T11:00:00.000Z");
  assertEquals(shape.currentHour, 11);
});

Deno.test("dayShape gives an empty day for a malformed body", async () => {
  const shape = await dayShape(creds, deps(stub({ text: "not json" })), DAY_OPTIONS);
  assertEquals(shape.blocks, new Array<number>(DAY_BLOCKS).fill(0));
  assertEquals(shape.meetingCount, 0);
  assertEquals(shape.freeMinutes, DAY_BLOCKS * 60);
});

Deno.test("dayShape raises with the reconnect flag matching the status", async () => {
  const unauthorized = await assertRejects(
    () => dayShape(creds, deps(stub({ status: 403, body: { token: TOKEN } })), DAY_OPTIONS),
    SourceError,
  );
  assertEquals(unauthorized.needsReconnect, true);
  assert(!unauthorized.message.includes(TOKEN));

  const broken = await assertRejects(
    () => dayShape(creds, deps(stub({ status: 502 })), DAY_OPTIONS),
    SourceError,
  );
  assertEquals(broken.needsReconnect, false);
});

// -- unreadCount -------------------------------------------------------------

const UNREAD_OPTIONS = { query: "is:unread category:primary" };

Deno.test("unreadCount reads the estimate and the newest subject", async () => {
  const stubbed = stub(
    { body: { resultSizeEstimate: 12, messages: [{ id: "m1" }, { id: "m2" }] } },
    {
      body: {
        payload: {
          headers: [
            { name: "From", value: "ops@example.com" },
            { name: "Subject", value: "Deploy failed on main" },
          ],
        },
      },
    },
  );

  assertEquals(await unreadCount(creds, deps(stubbed), UNREAD_OPTIONS), {
    count: 12,
    recent: "Deploy failed on main",
  });
});

Deno.test("unreadCount never asks Gmail for a message body", async () => {
  const stubbed = stub(
    { body: { resultSizeEstimate: 1, messages: [{ id: "m1" }] } },
    { body: { payload: { headers: [{ name: "Subject", value: "Hi" }] } } },
  );
  await unreadCount(creds, deps(stubbed), UNREAD_OPTIONS);

  const list = new URL(stubbed.urls[0]);
  assertEquals(list.searchParams.get("q"), UNREAD_OPTIONS.query);
  assertEquals(list.searchParams.get("maxResults"), "1");

  const message = new URL(stubbed.urls[1]);
  assertEquals(message.pathname, "/gmail/v1/users/me/messages/m1");
  assertEquals(message.searchParams.get("format"), "metadata");
  assertEquals(message.searchParams.getAll("metadataHeaders"), ["Subject"]);
});

Deno.test("unreadCount stops after the list when there is nothing unread", async () => {
  const stubbed = stub({ body: { resultSizeEstimate: 0, messages: [] } });
  assertEquals(await unreadCount(creds, deps(stubbed), UNREAD_OPTIONS), { count: 0, recent: null });
  assertEquals(stubbed.urls.length, 1);
});

Deno.test("unreadCount defaults rather than throwing on a malformed body", async () => {
  assertEquals(await unreadCount(creds, deps(stub({ text: "nope" })), UNREAD_OPTIONS), {
    count: 0,
    recent: null,
  });
  const noHeaders = stub(
    { body: { resultSizeEstimate: "many", messages: [{ id: "m1" }] } },
    { body: { payload: { headers: "nope" } } },
  );
  assertEquals(await unreadCount(creds, deps(noHeaders), UNREAD_OPTIONS), {
    count: 0,
    recent: null,
  });
});

Deno.test("unreadCount raises with the reconnect flag matching the status", async () => {
  const unauthorized = await assertRejects(
    () => unreadCount(creds, deps(stub({ status: 401, body: { t: TOKEN } })), UNREAD_OPTIONS),
    SourceError,
  );
  assertEquals(unauthorized.needsReconnect, true);
  assert(!unauthorized.message.includes(TOKEN));

  const broken = await assertRejects(
    () => unreadCount(creds, deps(stub({ status: 500 })), UNREAD_OPTIONS),
    SourceError,
  );
  assertEquals(broken.needsReconnect, false);
});
