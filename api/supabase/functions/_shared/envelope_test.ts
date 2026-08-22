import { assert, assertEquals, assertLess } from "@std/assert";

import {
  DEFAULT_POLL_MS,
  MIN_POLL_MS,
  PAYLOAD_MAX_BYTES,
  SUBJECT_MAX,
  TITLE_MAX,
} from "./badge-constants.ts";
import {
  buildEnvelope,
  byteLength,
  clampPollInterval,
  ENVELOPE_VERSION,
  errorPage,
  notConnectedPage,
  type PagePayload,
  trimPage,
  truncate,
} from "./envelope.ts";

const POMODORO = { work_min: 25, short_min: 5, long_min: 20, sessions: 4, leds: true };
const AT = new Date("2026-08-22T10:14:00Z");

function envelope(pages: PagePayload[], pollIntervalMs: unknown = 30000) {
  return buildEnvelope({ serverTime: AT, pollIntervalMs, pages, pomodoro: POMODORO });
}

Deno.test("truncate leaves a string that already fits", () => {
  assertEquals(truncate("short", 20), "short");
});

Deno.test("truncate marks a string that was cut", () => {
  const cut = truncate("x".repeat(50), 10);
  assertEquals(cut.length, 10);
  assert(cut.endsWith("…"));
});

Deno.test("truncate handles a cap too small for an ellipsis", () => {
  assertEquals(truncate("abc", 1), "a");
  assertEquals(truncate("abc", 0), "");
});

Deno.test("clampPollInterval holds the floor", () => {
  assertEquals(clampPollInterval(100), MIN_POLL_MS);
  assertEquals(clampPollInterval(60000), 60000);
});

Deno.test("clampPollInterval falls back when the value is not a number", () => {
  assertEquals(clampPollInterval(undefined), DEFAULT_POLL_MS);
  assertEquals(clampPollInterval("30000"), DEFAULT_POLL_MS);
  assertEquals(clampPollInterval(Number.NaN), DEFAULT_POLL_MS);
});

Deno.test("a title longer than the badge draws is cut server side", () => {
  const page = trimPage({
    slug: "next_thing",
    state: "ok",
    data: { title: "x".repeat(200) },
  });
  assertEquals((page.data?.title as string).length, TITLE_MAX);
});

Deno.test("a subject line takes the shorter cap", () => {
  const page = trimPage({
    slug: "counters",
    state: "ok",
    data: { recent: "y".repeat(200) },
  });
  assertEquals((page.data?.recent as string).length, SUBJECT_MAX);
});

Deno.test("trimming reaches strings nested in a list of objects", () => {
  const page = trimPage({
    slug: "deploys",
    state: "ok",
    data: { projects: [{ name: "n".repeat(90), commit: "c".repeat(90) }] },
  });
  const projects = page.data?.projects as { name: string; commit: string }[];
  assertEquals(projects[0].name.length, TITLE_MAX);
  assertEquals(projects[0].commit.length, SUBJECT_MAX);
});

Deno.test("a page with no data is left alone", () => {
  const page = notConnectedPage("deploys");
  assertEquals(trimPage(page), page);
});

Deno.test("numbers and booleans survive trimming untouched", () => {
  const page = trimPage({
    slug: "one_number",
    state: "ok",
    data: { value: 8412, spark: [1, 2, 3], all_day: false, missing: null },
  });
  assertEquals(page.data?.value, 8412);
  assertEquals(page.data?.spark, [1, 2, 3]);
  assertEquals(page.data?.all_day, false);
  assertEquals(page.data?.missing, null);
});

Deno.test("the envelope carries its version and the server time", () => {
  const built = envelope([]);
  assertEquals(built.v, ENVELOPE_VERSION);
  assertEquals(built.server_time, "2026-08-22T10:14:00.000Z");
});

Deno.test("a dead provider becomes its own error page and keeps its message", () => {
  const page = errorPage("one_number", "PostHog rejected the key");
  assertEquals(page.state, "error");
  assertEquals(page.message, "PostHog rejected the key");
});

Deno.test("an error message longer than the badge draws is cut", () => {
  const page = errorPage("one_number", "z".repeat(200));
  assertEquals(page.message?.length, SUBJECT_MAX);
});

Deno.test("one dead page does not take the others with it", () => {
  const built = envelope([
    { slug: "next_thing", state: "ok", data: { title: "Standup" } },
    errorPage("one_number", "PostHog rejected the key"),
    notConnectedPage("deploys"),
  ]);
  assertEquals(built.pages.length, 3);
  assertEquals(built.pages[0].state, "ok");
});

Deno.test("the whole response is held under the byte cap", () => {
  const heavy: PagePayload[] = Array.from({ length: 120 }, (_, index) => ({
    slug: `page_${index}`,
    state: "ok" as const,
    data: { title: "t".repeat(TITLE_MAX), recent: "r".repeat(SUBJECT_MAX) },
  }));
  const built = envelope(heavy);
  assertLess(byteLength(built), PAYLOAD_MAX_BYTES + 1);
  assertLess(built.pages.length, heavy.length);
});

Deno.test("pages are dropped from the end, so the first page always survives", () => {
  const heavy: PagePayload[] = Array.from({ length: 120 }, (_, index) => ({
    slug: index === 0 ? "next_thing" : `page_${index}`,
    state: "ok" as const,
    data: { title: "t".repeat(TITLE_MAX) },
  }));
  assertEquals(envelope(heavy).pages[0].slug, "next_thing");
});

Deno.test("an ordinary payload is nowhere near the cap", () => {
  const built = envelope([
    { slug: "next_thing", state: "ok", data: { title: "Platform review", minutes_until: 12 } },
    { slug: "day_shape", state: "ok", data: { blocks: Array(24).fill(1), meeting_count: 4 } },
    { slug: "deploys", state: "ok", data: { projects: [{ name: "magpi-web", state: "READY" }] } },
  ]);
  assertLess(byteLength(built), PAYLOAD_MAX_BYTES / 2);
});
