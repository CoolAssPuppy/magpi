// The badge-facing gateway. One route, one answer.
//
// verify_jwt is false in config.toml because a badge has no Supabase session
// and never gets one. Authentication is not skipped, it moves inside: the
// first act below resolves the bearer token by sha256 against
// badges.token_hash and refuses a revoked badge, before any work is done.

import { serviceClient, enforceRateLimits } from "../_shared/db.ts";
import { authenticateBadge, buildDesk, readDeviceReport, recordCheckIn } from "../_shared/desk.ts";
import { ApiError, bearerToken, jsonResponse, toErrorResponse } from "../_shared/errors.ts";
import { clientIp, handleOptions, withCors } from "../_shared/http.ts";

const ROUTE = "/gateway/desk";

/**
 * Per badge, so one badge polling too fast cannot spend another's budget, and
 * per IP as a backstop for a token that has not been resolved yet.
 *
 * The floor is 5 seconds, so 20 in a minute leaves room for a wearer pressing
 * C a few times without ever reaching the healthy interval's cost.
 */
const REQUESTS_PER_MINUTE = 20;

async function handle(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  if (!url.pathname.endsWith(ROUTE)) {
    throw new ApiError(404, "not_found", "no such route");
  }
  if (req.method !== "GET") {
    throw new ApiError(405, "method_not_allowed", "this route is a GET");
  }

  const db = serviceClient();
  const token = bearerToken(req.headers.get("authorization"), "a badge token is required");

  await enforceRateLimits(db, [
    {
      bucket: `desk:ip:${clientIp(req.headers)}`,
      limit: REQUESTS_PER_MINUTE * 4,
      windowSeconds: 60,
    },
  ]);

  const badge = await authenticateBadge(db, token);

  await enforceRateLimits(db, [
    { bucket: `desk:badge:${badge.id}`, limit: REQUESTS_PER_MINUTE, windowSeconds: 60 },
  ]);

  const report = readDeviceReport(url);
  // Before the payload, so a badge that times out mid-build still shows as
  // seen. This is what the dashboard's "seen 6 seconds ago" reads.
  await recordCheckIn(db, badge.id, report);

  const envelope = await buildDesk({
    db,
    badge,
    fetch,
    now: new Date(),
    timeZone: url.searchParams.get("tz") ?? "UTC",
  });

  return jsonResponse(envelope);
}

Deno.serve(async (req: Request) => {
  try {
    return withCors(await handle(req), req);
  } catch (error) {
    return withCors(toErrorResponse(error), req);
  }
});
