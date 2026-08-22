import { cached, ttlFor } from "../cache.ts";
import { credentialsFor } from "../connections.ts";
import type { PagePayload } from "../envelope.ts";
import { dayShape } from "../sources/index.ts";
import type { DayShape } from "../sources/contract.ts";

import type { BuildContext } from "./mod.ts";

export const slug = "day_shape";
export const requires = ["google"];

export async function build(ctx: BuildContext): Promise<PagePayload> {
  const credentials = await credentialsFor(ctx.rows, ctx.userId, "google");
  if (!credentials) return { slug, state: "not_connected" };

  const calendarId =
    typeof ctx.settings.calendar_id === "string" ? ctx.settings.calendar_id : "primary";
  // A is the badge's toggle, so both days are sent and the device picks. One
  // extra upstream call at a sixty second TTL beats a round trip on a press.
  const [today, tomorrow] = await Promise.all([
    load(ctx, credentials, calendarId, false),
    load(ctx, credentials, calendarId, true),
  ]);

  return {
    slug,
    state: "ok",
    data: {
      blocks: today.blocks,
      current_hour: today.currentHour,
      free_minutes: today.freeMinutes,
      meeting_count: today.meetingCount,
      tomorrow: {
        blocks: tomorrow.blocks,
        free_minutes: tomorrow.freeMinutes,
        meeting_count: tomorrow.meetingCount,
      },
    },
  };
}

async function load(
  ctx: BuildContext,
  credentials: Awaited<ReturnType<typeof credentialsFor>>,
  calendarId: string,
  forTomorrow: boolean,
): Promise<DayShape> {
  const payload = await cached(
    ctx.db,
    {
      userId: ctx.userId,
      provider: "google",
      cacheKey: `shape:${calendarId}:${forTomorrow ? "tomorrow" : "today"}`,
    },
    ttlFor(slug),
    async () => {
      const shape = await dayShape(credentials!, ctx.deps, { calendarId, forTomorrow });
      return shape as unknown as Record<string, unknown>;
    },
  );
  return payload as unknown as DayShape;
}
