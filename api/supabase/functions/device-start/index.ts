// POST /device-start. Unauthenticated: called by a badge that has no
// credential yet.

import { jsonResponse } from "../_shared/errors.ts";
import { serveFunction } from "../_shared/http.ts";
import { deviceStartSchema, parseBody } from "../_shared/validate.ts";
import { audit, enforceRateLimits, serviceClient } from "../_shared/db.ts";
import { pgPairingPort } from "../_shared/pairing_port.ts";
import { startDeviceAuth } from "../_shared/pairing.ts";

serveFunction("device-start", async (core) => {
  const input = parseBody(deviceStartSchema, core.body);
  const db = serviceClient();

  // Generous per badge: repeated reboots are a support issue, not an attack.
  // Tight per IP: many badges behind one NAT is expected, hundreds are not.
  await enforceRateLimits(db, [
    { bucket: `device-start:uid:${input.badge_uid}`, limit: 10, windowSeconds: 600 },
    { bucket: `device-start:ip:${core.ip}`, limit: 60, windowSeconds: 60 },
  ]);

  const webUrl = Deno.env.get("WEB_BASE_URL") ?? "http://localhost:3001";
  // The vanity shortlink on the badge screen. When set it replaces the app
  // origin in the QR, with the code appended.
  const pairingUrl = Deno.env.get("PAIRING_URL");
  const result = await startDeviceAuth(pgPairingPort(db), input, webUrl, pairingUrl);

  // No device code in the audit line: it is the secret just issued. fw and sdk
  // are recorded here and written to badges by the gateway heartbeat, since no
  // badge row exists yet at this point in the flow.
  audit({
    actor: `badge_uid:${input.badge_uid}`,
    action: "device.start",
    target: result.user_code,
    ip: core.ip,
    meta: { fw: input.fw, sdk: input.sdk },
  });

  return jsonResponse(result);
});
