import { cached, ttlFor } from "../cache.ts";
import { credentialsFor } from "../connections.ts";
import type { PagePayload } from "../envelope.ts";
import { insight } from "../sources/index.ts";
import type { NumberReading } from "../sources/contract.ts";

import type { BuildContext } from "./mod.ts";
import { chosenConnection } from "./settings.ts";

export const slug = "one_number";
export const requires = ["posthog"];

export async function build(ctx: BuildContext): Promise<PagePayload> {
  const connectionId = chosenConnection(ctx.settings);
  const credentials = await credentialsFor(ctx.rows, ctx.userId, "posthog", connectionId);
  if (!credentials) return { slug, state: "not_connected" };

  const insightId =
    typeof credentials.meta.insight_id === "string" ? credentials.meta.insight_id : null;
  if (!insightId) return { slug, state: "empty" };

  const payload = await cached(
    ctx.db,
    {
      userId: ctx.userId,
      provider: "posthog",
      cacheKey: `insight:${insightId}`,
      connectionId,
    },
    ttlFor(slug),
    async () => {
      const reading = await insight(credentials, ctx.deps);
      return reading as unknown as Record<string, unknown>;
    },
  );

  const reading = payload as unknown as NumberReading;
  if (reading.value === undefined || reading.value === null) {
    return { slug, state: "empty" };
  }

  return {
    slug,
    state: "ok",
    data: {
      label: reading.label,
      value: reading.value,
      unit: reading.unit,
      spark: reading.spark,
      delta_pct: reading.deltaPct,
      updated: reading.updated,
      source: "PostHog",
    },
  };
}
