// POST /device-approve. Binds a pending pairing to the confirming user. No
// badge token is minted here, which keeps the badge credential out of the
// browser entirely.

import { ApiError, jsonResponse } from "../_shared/errors.ts";
import { serveFunction } from "../_shared/http.ts";
import { deviceApproveSchema, parseBody, USER_CODE_RE } from "../_shared/validate.ts";
import { audit, enforceRateLimits, serviceClient } from "../_shared/db.ts";
import { pgPairingPort } from "../_shared/pairing_port.ts";
import { approveDeviceAuth, previewDeviceAuth, shortBadgeId } from "../_shared/pairing.ts";
import { requireUser } from "../_shared/auth.ts";

serveFunction("device-approve", async (core) => {
  const db = serviceClient();

  // Identity comes from the verified token, never from the request body.
  const user = await requireUser(core.headers);

  // GET names the badge being linked, so the confirm screen can be checked
  // against what the badge is showing.
  if (core.method === "GET") {
    const userCode = core.query.get("user_code") ?? "";
    if (!USER_CODE_RE.test(userCode)) {
      throw new ApiError(400, "invalid_request", "user_code is malformed");
    }
    await enforceRateLimits(db, [
      { bucket: `device-preview:user:${user.id}`, limit: 20, windowSeconds: 600 },
      { bucket: `device-preview:ip:${core.ip}`, limit: 40, windowSeconds: 600 },
    ]);
    const preview = await previewDeviceAuth(pgPairingPort(db), { user_code: userCode });
    return jsonResponse(preview);
  }

  const input = parseBody(deviceApproveSchema, core.body);

  await enforceRateLimits(db, [
    // Per user, so a compromised session cannot walk the code space.
    { bucket: `device-approve:user:${user.id}`, limit: 20, windowSeconds: 600 },
    { bucket: `device-approve:ip:${core.ip}`, limit: 30, windowSeconds: 600 },
  ]);

  const result = await approveDeviceAuth(pgPairingPort(db), input, user.id);

  audit({
    actor: `user:${user.id}`,
    action: result.status === "approved" ? "device.approve" : "device.deny",
    target: input.user_code,
    ip: core.ip,
    meta: { badge: shortBadgeId(result.badge_uid) },
  });

  return jsonResponse({ status: result.status, badge: shortBadgeId(result.badge_uid) });
});
