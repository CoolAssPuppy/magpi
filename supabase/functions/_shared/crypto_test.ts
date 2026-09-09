import { assert, assertEquals, assertNotEquals } from "@std/assert";

import { base64urlEncode, randomToken, sha256Base64Url, sha256Hex, timingSafeEqual } from "./crypto.ts";

Deno.test("base64url encoding has no padding and no url-hostile characters", () => {
  const encoded = base64urlEncode(new Uint8Array([251, 255, 190, 0]));
  assert(!encoded.includes("="));
  assert(!encoded.includes("+"));
  assert(!encoded.includes("/"));
});

Deno.test("two tokens minted in a row differ", () => {
  assertNotEquals(randomToken(), randomToken());
});

Deno.test("sha256 hex matches the known digest of an empty string", async () => {
  assertEquals(
    await sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

Deno.test("the pkce challenge is the base64url sha256 of the verifier", async () => {
  // The worked example from RFC 7636 appendix B.
  assertEquals(
    await sha256Base64Url("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

Deno.test("a constant time comparison still answers correctly", () => {
  assert(timingSafeEqual("abc", "abc"));
  assert(!timingSafeEqual("abc", "abd"));
  assert(!timingSafeEqual("abc", "abcd"));
});
