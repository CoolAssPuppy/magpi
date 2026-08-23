import assert from "node:assert/strict";
import test from "node:test";

import { gatewayConfig } from "./package-badge.mjs";

test("takes the functions origin Doppler already holds", () => {
  const config = gatewayConfig({ FUNCTIONS_BASE_URL: "https://proj.supabase.co/functions/v1" });
  assert.deepEqual(config, { gateway: "https://proj.supabase.co/functions/v1" });
});

test("MAGPI_GATEWAY wins, so a badge can be pointed at a local stack", () => {
  const config = gatewayConfig({
    MAGPI_GATEWAY: "http://192.168.1.20:56521/functions/v1",
    FUNCTIONS_BASE_URL: "https://proj.supabase.co/functions/v1",
  });
  assert.equal(config.gateway, "http://192.168.1.20:56521/functions/v1");
});

test("builds the origin from the project URL when nothing names it", () => {
  const config = gatewayConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co" });
  assert.equal(config.gateway, "https://proj.supabase.co/functions/v1");
});

test("a trailing slash does not become a double slash in a request path", () => {
  const config = gatewayConfig({ FUNCTIONS_BASE_URL: "https://proj.supabase.co/functions/v1/" });
  assert.equal(config.gateway, "https://proj.supabase.co/functions/v1");
});

test("carries the certificate pin when one is configured", () => {
  const config = gatewayConfig({
    FUNCTIONS_BASE_URL: "https://proj.supabase.co/functions/v1",
    MAGPI_CERT_SHA256: "AB12",
    MAGPI_REQUIRE_PIN: "true",
  });
  assert.equal(config.cert_sha256, "ab12");
  assert.equal(config.require_pin, true);
});

test("leaves the pin out entirely rather than writing an empty one", () => {
  const config = gatewayConfig({ FUNCTIONS_BASE_URL: "https://proj.supabase.co/functions/v1" });
  assert.equal("cert_sha256" in config, false);
  assert.equal("require_pin" in config, false);
});

test("refuses a loopback gateway, which no badge can reach", () => {
  assert.throws(
    () => gatewayConfig({ FUNCTIONS_BASE_URL: "http://127.0.0.1:56521/functions/v1" }),
    /MAGPI_GATEWAY/,
  );
  assert.throws(
    () => gatewayConfig({ MAGPI_GATEWAY: "http://localhost:56521/functions/v1" }),
    /LAN/,
  );
  assert.throws(() => gatewayConfig({ MAGPI_GATEWAY: "http://[::1]:56521/functions/v1" }), /LAN/);
});

test("a LAN address on the same port is fine", () => {
  const config = gatewayConfig({ MAGPI_GATEWAY: "http://192.168.4.20:56521/functions/v1" });
  assert.equal(config.gateway, "http://192.168.4.20:56521/functions/v1");
});

test("refuses a gateway that is not an absolute http URL", () => {
  assert.throws(() => gatewayConfig({ MAGPI_GATEWAY: "proj.supabase.co" }), /http/);
});

test("says which variable to set when none of them are", () => {
  assert.throws(() => gatewayConfig({}), /MAGPI_GATEWAY/);
});
