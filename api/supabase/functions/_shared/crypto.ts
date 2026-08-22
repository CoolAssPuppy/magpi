// Hashing and token helpers. Device codes and badge tokens are 32 random
// bytes, base64url encoded, and only their sha256 hashes ever reach the
// database, so a stolen row cannot be replayed as a credential.

export const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// For PKCE S256 code challenges.
export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64urlEncode(new Uint8Array(digest));
}

// The "\x<hex>" text form PostgREST accepts for bytea columns.
export async function sha256Bytea(input: string): Promise<string> {
  return "\\x" + (await sha256Hex(input));
}

export type RandomSource = (buffer: Uint8Array) => Uint8Array;

// 8 characters from the 31-character unambiguous alphabet, formatted
// XXXX-XXXX. Bytes >= 248 (8 * 31) are rejected so indexing stays uniform
// modulo 31.
export function generateUserCode(random: RandomSource = (b) => crypto.getRandomValues(b)): string {
  const buf = new Uint8Array(16);
  let code = "";
  while (code.length < 8) {
    random(buf);
    for (const b of buf) {
      if (b >= 248) continue;
      code += USER_CODE_ALPHABET[b % 31];
      if (code.length === 8) break;
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
