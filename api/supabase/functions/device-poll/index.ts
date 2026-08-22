// POST /device-poll. Unauthenticated: the device_code is the credential.
// Returns the badge token exactly once, on the first poll after approval, and
// the row is terminal from that moment.

import { jsonResponse } from "../_shared/errors.ts";
import { serveFunction } from "../_shared/http.ts";
import { devicePollSchema, parseBody } from "../_shared/validate.ts";
import { audit, enforceRateLimits, serviceClient } from "../_shared/db.ts";
import { pgPairingPort } from "../_shared/pairing_port.ts";
import { pollDeviceAuth } from "../_shared/pairing.ts";

serveFunction("device-poll", async (core) => {
  const input = parseBody(devicePollSchema, core.body);
  const db = serviceClient();

  // Bounds a runaway client only; the state machine's slow_down does the
  // ordinary pacing.
  await enforceRateLimits(db, [
    { bucket: `device-poll:ip:${core.ip}`, limit: 300, windowSeconds: 60 },
  ]);

  const result = await pollDeviceAuth(pgPairingPort(db), input);

  audit({
    actor: `badge:${result.badge_id}`,
    action: "device.claim",
    target: result.badge_id,
    ip: core.ip,
  });

  return jsonResponse({
    badge_token: result.badge_token,
    badge_id: result.badge_id,
    user: result.user,
  });
});
