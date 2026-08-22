import { cached, ttlFor } from "../cache.ts";
import { credentialsFor } from "../connections.ts";
import type { PagePayload } from "../envelope.ts";
import { deployments } from "../sources/index.ts";
import type { Deployment } from "../sources/contract.ts";

import type { BuildContext } from "./mod.ts";
import { chosenConnection } from "./settings.ts";

export const slug = "deploys";
export const requires = ["vercel"];

/** What the page draws before scrolling. Sending more is bytes nobody reads. */
const LIMIT = 4;

export async function build(ctx: BuildContext): Promise<PagePayload> {
  const connectionId = chosenConnection(ctx.settings);
  const credentials = await credentialsFor(ctx.rows, ctx.userId, "vercel", connectionId);
  if (!credentials) return { slug, state: "not_connected" };

  const teamId = typeof credentials.meta.team_id === "string" ? credentials.meta.team_id : null;
  const payload = await cached(
    ctx.db,
    {
      userId: ctx.userId,
      provider: "vercel",
      cacheKey: `deploys:${teamId ?? "personal"}`,
      connectionId,
    },
    ttlFor(slug),
    async () => {
      const found = await deployments(credentials, ctx.deps, {
        teamId,
        limit: LIMIT,
      });
      return { projects: found as unknown as Record<string, unknown>[] };
    },
  );

  const found = ((payload.projects ?? []) as unknown as Deployment[]).slice(0, LIMIT);
  if (found.length === 0) return { slug, state: "empty" };

  const cachedAt = typeof payload.cached_at === "number" ? payload.cached_at : ctx.now.getTime();
  const heldMs = Math.max(0, ctx.now.getTime() - cachedAt);

  return {
    slug,
    state: "ok",
    data: {
      projects: found.map((deployment) => ({
        name: deployment.name,
        state: deployment.state,
        commit: deployment.commit,
        // Aged past however long the cache held it, so "40s ago" does not
        // stay 40s ago for the whole TTL.
        age_ms: deployment.ageMs + heldMs,
      })),
    },
  };
}
