import { assert, assertEquals } from "@std/assert";

import { DAY_BLOCKS, SUBJECT_MAX } from "../badge-constants.ts";

import { build, slug } from "./day_shape.ts";
import { buildPage } from "./mod.ts";
import {
  connectionRow,
  contextFor,
  FakeCache,
  fields,
  list,
  noFetch,
  stubFetch,
  text,
} from "./support_test.ts";

/** The window starts at DAY_START_HOUR on the wearer's clock, one day apart. */
const TODAY = "timeMin=2026-01-15T07";
const TOMORROW = "timeMin=2026-01-16T07";

function meeting(startIso: string, endIso: string, summary = "review"): Record<string, unknown> {
  return { summary, start: { dateTime: startIso }, end: { dateTime: endIso } };
}

const TODAY_EVENTS = {
  items: [
    meeting("2026-01-15T10:00:00Z", "2026-01-15T11:00:00Z", "design review"),
    meeting("2026-01-15T13:00:00Z", "2026-01-15T13:20:00Z", "standup"),
  ],
};

const TOMORROW_EVENTS = {
  items: [meeting("2026-01-16T09:00:00Z", "2026-01-16T09:30:00Z", "one to one")],
};

/** A strip of DAY_BLOCKS free hours, with the booked ones filled in by index. */
function strip(booked: Record<number, number> = {}): number[] {
  const blocks = new Array<number>(DAY_BLOCKS).fill(0);
  for (const [index, level] of Object.entries(booked)) blocks[Number(index)] = level;
  return blocks;
}

const BOTH_DAYS = { [TODAY]: { body: TODAY_EVENTS }, [TOMORROW]: { body: TOMORROW_EVENTS } };

async function googleRows() {
  return [await connectionRow({ provider: "google" })];
}

Deno.test("day_shape paints an hour darker the more of it is booked", async () => {
  const stub = stubFetch(BOTH_DAYS);
  const page = await build(contextFor({ rows: await googleRows(), fetch: stub.fetch }));

  assertEquals(page.state, "ok");
  const data = fields(page.data);
  // 07:00 is block zero, so the hour-long meeting at 10:00 is block three.
  assertEquals(data.blocks, strip({ 3: 3, 6: 1 }));
  assertEquals(data.meeting_count, 2);
  assertEquals(data.free_minutes, 24 * 60 - 60 - 20);
  assertEquals(data.current_hour, 9);
});

Deno.test(
  "day_shape carries tomorrow as well, so the toggle never waits on the network",
  async () => {
    const stub = stubFetch(BOTH_DAYS);
    const page = await build(contextFor({ rows: await googleRows(), fetch: stub.fetch }));

    assertEquals(fields(page.data).tomorrow, {
      blocks: strip({ 2: 2 }),
      free_minutes: 24 * 60 - 30,
      meeting_count: 1,
    });
    assertEquals(stub.urls.length, 2);
  },
);

Deno.test("day_shape draws a free day when the calendar is empty", async () => {
  const stub = stubFetch({ [TODAY]: { body: { items: [] } }, [TOMORROW]: { body: { items: [] } } });
  const page = await build(contextFor({ rows: await googleRows(), fetch: stub.fetch }));

  const data = fields(page.data);
  assertEquals(data.blocks, strip());
  assertEquals(data.meeting_count, 0);
  assertEquals(data.free_minutes, DAY_BLOCKS * 60);
});

Deno.test("day_shape is not connected when the wearer has no google connection", async () => {
  const page = await build(contextFor({ rows: [], fetch: noFetch }));
  assertEquals(page, { slug, state: "not_connected" });
});

Deno.test("day_shape becomes its own error page when google will not answer", async () => {
  const stub = stubFetch({ "calendar/v3": { status: 500 } });
  const page = await buildPage(slug, contextFor({ rows: await googleRows(), fetch: stub.fetch }));

  assertEquals(page?.state, "error");
  const message = text(page?.message);
  assert(message.startsWith("google is not answering"));
  // Even the reason is cut to what the badge draws.
  assertEquals(message.length, SUBJECT_MAX);
});

Deno.test("day_shape sends the badge numbers only, so nothing needs cutting", async () => {
  const stub = stubFetch(BOTH_DAYS);
  const page = await build(contextFor({ rows: await googleRows(), fetch: stub.fetch }));

  const data = fields(page.data);
  for (const value of list(data.blocks)) assertEquals(typeof value, "number");
  assertEquals(typeof data.current_hour, "number");
  assertEquals(typeof data.free_minutes, "number");
  assertEquals(typeof data.meeting_count, "number");
  // No meeting titles either: the strip is a shape, not an agenda.
  assert(!JSON.stringify(page.data).includes("design review"));
});

Deno.test("day_shape reads the calendar the wearer configured", async () => {
  const cache = new FakeCache();
  const stub = stubFetch(BOTH_DAYS);
  await build(
    contextFor({
      cache,
      rows: await googleRows(),
      fetch: stub.fetch,
      settings: { calendar_id: "team@example.com" },
    }),
  );

  assert(new URL(stub.urls[0]).pathname.endsWith("/calendars/team%40example.com/events"));
  assert(cache.read("google", "shape:team@example.com:today"));
  assert(cache.read("google", "shape:team@example.com:tomorrow"));
});

Deno.test("day_shape holds each day under its own key, so neither serves the other", async () => {
  const cache = new FakeCache();
  const stub = stubFetch(BOTH_DAYS);
  const rows = await googleRows();

  const first = await build(contextFor({ cache, rows, fetch: stub.fetch }));
  const second = await build(contextFor({ cache, rows, fetch: noFetch }));

  assertEquals(second, first);
  assertEquals(stub.urls.length, 2);
});
