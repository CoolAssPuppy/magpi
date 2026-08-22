import { assert, assertEquals } from "@std/assert";

import { SUBJECT_MAX, TITLE_MAX } from "../badge-constants.ts";
import { trimPage } from "../envelope.ts";

import { build, slug } from "./next_thing.ts";
import { buildPage } from "./mod.ts";
import {
  connectionRow,
  contextFor,
  FakeCache,
  fields,
  list,
  noFetch,
  NOW_MS,
  stubFetch,
  text,
} from "../testing/page_support.ts";

const CALENDAR = "googleapis.com/calendar/v3";

interface EventOverrides {
  summary?: string;
  start?: Record<string, unknown>;
  end?: Record<string, unknown>;
  location?: string;
  hangoutLink?: string;
}

/** One Google Calendar item, in the shape the API returns it. */
function calendarEvent(overrides: EventOverrides = {}): Record<string, unknown> {
  return {
    summary: "standup",
    start: { dateTime: "2026-01-15T09:30:00Z" },
    end: { dateTime: "2026-01-15T09:45:00Z" },
    ...overrides,
  };
}

const DAY = [
  calendarEvent({
    location: "Room 2",
    hangoutLink: "https://meet.google.com/abc-defg",
  }),
  calendarEvent({
    summary: "design review",
    start: { dateTime: "2026-01-15T10:00:00Z" },
    end: { dateTime: "2026-01-15T11:00:00Z" },
  }),
  calendarEvent({
    summary: "one to one",
    start: { dateTime: "2026-01-15T14:00:00Z" },
    end: { dateTime: "2026-01-15T14:30:00Z" },
  }),
];

async function googleRows() {
  return [await connectionRow({ provider: "google" })];
}

Deno.test("next_thing shows the meeting after the current one", async () => {
  const stub = stubFetch({ [CALENDAR]: { body: { items: DAY } } });
  const page = await build(contextFor({ rows: await googleRows(), fetch: stub.fetch }));

  assertEquals(page.state, "ok");
  const data = fields(page.data);
  assertEquals(data.title, "standup");
  assertEquals(data.start, "09:30");
  assertEquals(data.end, "09:45");
  assertEquals(data.location, "Room 2");
  assertEquals(data.conferencing, "MEET");
  assertEquals(data.all_day, false);
});

Deno.test("next_thing carries the two meetings after it, for the reveal", async () => {
  const stub = stubFetch({ [CALENDAR]: { body: { items: DAY } } });
  const page = await build(contextFor({ rows: await googleRows(), fetch: stub.fetch }));

  assertEquals(fields(page.data).more, [
    { title: "design review", start: "10:00" },
    { title: "one to one", start: "14:00" },
  ]);
});

Deno.test(
  "next_thing counts down from this request's clock, not from when the answer was cached",
  async () => {
    const cache = new FakeCache();
    cache.put({
      provider: "google",
      cache_key: "next:primary:12",
      payload: {
        events: [
          {
            title: "standup",
            start: "09:30",
            end: "09:45",
            location: null,
            conferencing: null,
            minutesUntil: 30,
            allDay: false,
          },
        ],
        cached_at: NOW_MS - 5 * 60_000,
      },
    });

    // noFetch: a cached answer must not go upstream again.
    const page = await build(contextFor({ cache, rows: await googleRows(), fetch: noFetch }));
    assertEquals(fields(page.data).minutes_until, 25);
  },
);

Deno.test("next_thing trusts a held answer that carries no stamp", async () => {
  const cache = new FakeCache();
  cache.put({
    provider: "google",
    cache_key: "next:primary:12",
    payload: {
      events: [
        {
          title: "standup",
          start: "09:30",
          end: "09:45",
          location: null,
          conferencing: null,
          minutesUntil: 30,
          allDay: false,
        },
      ],
    },
  });

  const page = await build(contextFor({ cache, rows: await googleRows(), fetch: noFetch }));
  assertEquals(fields(page.data).minutes_until, 30);
});

Deno.test("next_thing is empty when nothing is booked in the window", async () => {
  const stub = stubFetch({ [CALENDAR]: { body: { items: [] } } });
  const page = await build(contextFor({ rows: await googleRows(), fetch: stub.fetch }));

  assertEquals(page, { slug, state: "empty" });
});

Deno.test("next_thing is not connected when the wearer has no google connection", async () => {
  const page = await build(contextFor({ rows: [], fetch: noFetch }));
  assertEquals(page, { slug, state: "not_connected" });
});

Deno.test("next_thing becomes its own error page when google refuses the credential", async () => {
  const stub = stubFetch({ [CALENDAR]: { status: 401 } });
  const page = await buildPage(slug, contextFor({ rows: await googleRows(), fetch: stub.fetch }));

  assertEquals(page?.state, "error");
  assertEquals(page?.message, "reconnect google on the connections page");
  assert(text(page?.message).length <= SUBJECT_MAX);
});

Deno.test("next_thing cuts a title longer than the badge can draw", async () => {
  const stub = stubFetch({
    [CALENDAR]: {
      body: { items: [calendarEvent({ summary: "m".repeat(200) })] },
    },
  });
  const page = trimPage(await build(contextFor({ rows: await googleRows(), fetch: stub.fetch })));

  const title = text(fields(page.data).title);
  assertEquals(title.length, TITLE_MAX);
  assert(title.endsWith("…"));
});

Deno.test("next_thing skips all-day events, which say nothing about the next hour", async () => {
  const allDay = calendarEvent({
    summary: "conference",
    start: { date: "2026-01-15" },
    end: { date: "2026-01-16" },
  });
  const stub = stubFetch({ [CALENDAR]: { body: { items: [allDay, ...DAY] } } });
  const page = await build(contextFor({ rows: await googleRows(), fetch: stub.fetch }));

  assertEquals(fields(page.data).title, "standup");
});

Deno.test("next_thing keeps all-day events when the wearer asked for them", async () => {
  const allDay = calendarEvent({
    summary: "conference",
    start: { date: "2026-01-15" },
    end: { date: "2026-01-16" },
  });
  const stub = stubFetch({ [CALENDAR]: { body: { items: [allDay, ...DAY] } } });
  const page = await build(
    contextFor({
      rows: await googleRows(),
      fetch: stub.fetch,
      settings: { skip_all_day: false },
    }),
  );

  const data = fields(page.data);
  assertEquals(data.title, "conference");
  assertEquals(data.all_day, true);
  assertEquals(data.start, "00:00");
  assertEquals(data.end, "23:59");
});

Deno.test("next_thing reads the calendar and the horizon the wearer configured", async () => {
  const stub = stubFetch({ [CALENDAR]: { body: { items: DAY } } });
  const cache = new FakeCache();
  await build(
    contextFor({
      cache,
      rows: await googleRows(),
      fetch: stub.fetch,
      settings: { calendar_id: "team@example.com", look_ahead_hours: 3 },
    }),
  );

  const url = new URL(stub.urls[0]);
  assert(url.pathname.endsWith("/calendars/team%40example.com/events"));
  assertEquals(url.searchParams.get("timeMax"), new Date(NOW_MS + 3 * 3_600_000).toISOString());
  // The settings are part of the key, so changing one does not read the other's answer.
  assert(cache.read("google", "next:team@example.com:3"));
});

Deno.test("next_thing falls back to the primary calendar for settings it cannot read", async () => {
  const stub = stubFetch({ [CALENDAR]: { body: { items: DAY } } });
  const cache = new FakeCache();
  await build(
    contextFor({
      cache,
      rows: await googleRows(),
      fetch: stub.fetch,
      settings: { calendar_id: "", look_ahead_hours: "twelve" },
    }),
  );

  assert(cache.read("google", "next:primary:12"));
});

Deno.test("next_thing asks the calendar once per cache window", async () => {
  const cache = new FakeCache();
  const stub = stubFetch({ [CALENDAR]: { body: { items: DAY } } });
  const rows = await googleRows();

  await build(contextFor({ cache, rows, fetch: stub.fetch }));
  await build(contextFor({ cache, rows, fetch: stub.fetch }));

  assertEquals(stub.urls.length, 1);
  assertEquals(list(cache.all).length, 1);
});
