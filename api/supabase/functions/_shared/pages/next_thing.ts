import { cached, ttlFor } from "../cache.ts";
import type { PagePayload } from "../envelope.ts";
import { credentialsFor } from "../connections.ts";
import { nextEvents } from "../sources/index.ts";
import type { CalendarEvent } from "../sources/contract.ts";

import type { BuildContext } from "./mod.ts";

export const slug = "next_thing";
export const requires = ["google"];

const DEFAULT_LOOK_AHEAD_HOURS = 12;
/** The one shown plus the two A reveals. */
const LIMIT = 3;

export async function build(ctx: BuildContext): Promise<PagePayload> {
  const credentials = await credentialsFor(ctx.rows, ctx.userId, "google");
  if (!credentials) return { slug, state: "not_connected" };

  const calendarId = readString(ctx.settings.calendar_id) ?? "primary";
  const lookAheadHours = readNumber(ctx.settings.look_ahead_hours) ?? DEFAULT_LOOK_AHEAD_HOURS;
  const skipAllDay = ctx.settings.skip_all_day !== false;

  const payload = await cached(
    ctx.db,
    { userId: ctx.userId, provider: "google", cacheKey: `next:${calendarId}:${lookAheadHours}` },
    ttlFor(slug),
    async () => {
      const events = await nextEvents(credentials, ctx.deps, {
        calendarId,
        lookAheadHours,
        skipAllDay,
        limit: LIMIT,
      });
      return { events: events as unknown as Record<string, unknown>[] };
    },
  );

  const events = (payload.events ?? []) as unknown as CalendarEvent[];
  if (events.length === 0) return { slug, state: "empty" };

  const [next, ...rest] = events;
  return {
    slug,
    state: "ok",
    data: {
      title: next.title,
      start: next.start,
      end: next.end,
      location: next.location,
      conferencing: next.conferencing,
      // Recomputed against this request's clock rather than trusted from the
      // cache: a payload held for sixty seconds would otherwise tell a badge
      // a meeting is still twelve minutes away when it is eleven.
      minutes_until: minutesUntil(next, payload, ctx.now),
      all_day: next.allDay,
      more: rest.map((event) => ({ title: event.title, start: event.start })),
    },
  };
}

/**
 * The cached value, aged by however long the cache has held it.
 *
 * `cachedAt` is written by the cache read itself; a miss stamps it now, so the
 * arithmetic is the same either way.
 */
function minutesUntil(event: CalendarEvent, payload: Record<string, unknown>, now: Date): number {
  const cachedAt = readNumber(payload.cached_at);
  if (cachedAt === null) return event.minutesUntil;
  const elapsedMinutes = Math.floor((now.getTime() - cachedAt) / 60000);
  return event.minutesUntil - elapsedMinutes;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
