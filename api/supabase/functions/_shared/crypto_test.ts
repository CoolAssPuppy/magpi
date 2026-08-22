import { assert, assertEquals } from "@std/assert";
import {
  base64urlEncode,
  generateUserCode,
  randomToken,
  sha256Base64Url,
  sha256Bytea,
  sha256Hex,
} from "./crypto.ts";

Deno.test("sha256Hex matches the known vector for 'abc'", async () => {
  assertEquals(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

Deno.test("sha256Bytea prefixes hex for PostgREST bytea input", async () => {
  const h = await sha256Bytea("abc");
  assert(h.startsWith("\\x"));
  assertEquals(h.slice(2), await sha256Hex("abc"));
});

Deno.test("sha256Base64Url matches the RFC 7636 S256 test vector", async () => {
  assertEquals(
    await sha256Base64Url("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

Deno.test("base64urlEncode uses url-safe alphabet without padding", () => {
  assertEquals(base64urlEncode(new Uint8Array([0xfb, 0xff, 0xfe])), "-__-");
  assertEquals(base64urlEncode(new Uint8Array([])), "");
});

Deno.test("randomToken is 32 bytes base64url by default and unique", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const t = randomToken();
    assertEquals(t.length, 43);
    assert(/^[A-Za-z0-9_-]+$/.test(t));
    seen.add(t);
  }
  assertEquals(seen.size, 200);
});

Deno.test("generateUserCode matches XXXX-XXXX from the unambiguous alphabet", () => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const code = generateUserCode();
    assert(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), code);
    for (const ch of code.replace("-", "")) {
      assert(alphabet.includes(ch), `ambiguous char ${ch}`);
    }
    seen.add(code);
  }
  assertEquals(seen.size, 2000);
});

Deno.test("generateUserCode honors an injected random source", () => {
  const zeros = (buf: Uint8Array) => buf.fill(0);
  const ascending = (buf: Uint8Array) => {
    for (let i = 0; i < buf.length; i++) buf[i] = i;
    return buf;
  };
  assertEquals(generateUserCode(zeros), "AAAA-AAAA");
  assertEquals(generateUserCode(ascending), "ABCD-EFGH");
});

Deno.test("generateUserCode rejects bytes at or above 248", () => {
  // First draw is all rejected bytes, second draw is all zeros.
  let draws = 0;
  const source = (buf: Uint8Array) => {
    draws += 1;
    return buf.fill(draws === 1 ? 255 : 0);
  };
  assertEquals(generateUserCode(source), "AAAA-AAAA");
  assertEquals(draws, 2);
});
