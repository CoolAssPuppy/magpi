// Encryption at rest for provider tokens. AES-256-GCM via WebCrypto, key from
// TOKEN_ENCRYPTION_KEY.
//
// Not pgsodium: its transparent column encryption is deprecated on the
// platform and would put the plaintext inside Postgres, where it reaches query
// logs and `explain` output.
//
// Envelope layout, stored in the bytea column:
//
//   version 2 (written)      version 1 (read only)
//   byte 0   format version   byte 0        format version
//   byte 1   key id           bytes 1..12   random 96-bit IV
//   bytes 2..13  random IV    bytes 13..    ciphertext with 128-bit tag
//   bytes 14..   ciphertext
//
// The AAD is `${user_id}:${provider}`, so an attacker with write access to
// connections cannot move another user's ciphertext into their own row.
//
// Why the key id exists. Version 1 named no key, so the only key that could
// decrypt a row was whatever TOKEN_ENCRYPTION_KEY happened to hold: changing
// the secret made every stored connection permanently unreadable, and there
// was no way to tell a row encrypted under the old key from one encrypted
// under the new. A byte spent naming the key makes rotation a migration
// rather than a data loss event, and it cannot be added after the fact
// because existing rows would not carry it.
//
// Rotating:
//   1. Move the current key into TOKEN_ENCRYPTION_KEYS_PREVIOUS as `id:key`.
//   2. Set TOKEN_ENCRYPTION_KEY to the new key and bump TOKEN_ENCRYPTION_KEY_ID.
//   3. New writes use the new key; old rows still decrypt under the old one.
//   4. Once every row has been rewritten, drop the previous entry.

import { ApiError } from "./errors.ts";

const KEY_ENV = "TOKEN_ENCRYPTION_KEY";
const KEY_ID_ENV = "TOKEN_ENCRYPTION_KEY_ID";
const PREVIOUS_KEYS_ENV = "TOKEN_ENCRYPTION_KEYS_PREVIOUS";

const FORMAT_VERSION = 2;
/** Written before key ids existed. Decrypts under the active key. */
const LEGACY_FORMAT_VERSION = 1;

const IV_BYTES = 12;
const KEY_BYTES = 32;
const DEFAULT_KEY_ID = 1;

// Keyed by the raw base64, so rotating a secret in place is picked up rather
// than served from a stale import.
const keyCache = new Map<string, CryptoKey>();

function misconfigured(): ApiError {
  // Vague to the caller; the log line carries the detail.
  return new ApiError(500, "misconfigured", "server is not configured");
}

function unreadable(): ApiError {
  return new ApiError(500, "internal", "stored token could not be read");
}

// WebCrypto's types require a view backed by a plain ArrayBuffer, not the
// SharedArrayBuffer a bare Uint8Array may carry, so every buffer reaching
// crypto.subtle goes through these two helpers.
function allocate(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(length));
}

function copy(source: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = allocate(source.length);
  out.set(source);
  return out;
}

function decodeBase64(input: string): Uint8Array<ArrayBuffer> {
  const binary = atob(input.trim());
  const out = allocate(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new ApiError(500, "internal", "stored token is malformed");
  }
  const out = allocate(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Imports and caches one base64 key. `label` only ever reaches a log line. */
async function importKey(raw: string, label: string): Promise<CryptoKey> {
  const cached = keyCache.get(raw);
  if (cached) return cached;

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = decodeBase64(raw);
  } catch {
    console.error(`${label} is not valid base64`);
    throw misconfigured();
  }
  if (bytes.length !== KEY_BYTES) {
    console.error(`${label} must decode to ${KEY_BYTES} bytes, got ${bytes.length}`);
    throw misconfigured();
  }

  // extractable = false: the key material cannot be read back out, so it
  // cannot reach a log line or a response body.
  const key = await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  keyCache.set(raw, key);
  return key;
}

function activeKeyId(): number {
  const raw = Deno.env.get(KEY_ID_ENV);
  if (!raw) return DEFAULT_KEY_ID;
  const id = Number(raw);
  // One byte, and 0 is reserved so a zeroed envelope cannot look valid.
  if (!Number.isInteger(id) || id < 1 || id > 255) {
    console.error(`${KEY_ID_ENV} must be an integer from 1 to 255, got ${raw}`);
    throw misconfigured();
  }
  return id;
}

async function activeKey(): Promise<{ id: number; key: CryptoKey }> {
  const raw = Deno.env.get(KEY_ENV);
  if (!raw) {
    console.error(`${KEY_ENV} is not set; provider tokens cannot be used`);
    throw misconfigured();
  }
  return { id: activeKeyId(), key: await importKey(raw, KEY_ENV) };
}

/**
 * Decrypt-only keys, as `id:base64` pairs separated by commas.
 *
 * A malformed entry is fatal rather than skipped. Ignoring one would turn a
 * typo during rotation into rows that silently stop decrypting, which is the
 * exact failure this whole mechanism exists to prevent.
 */
function previousKeyEntries(): Map<number, string> {
  const raw = Deno.env.get(PREVIOUS_KEYS_ENV);
  const entries = new Map<number, string>();
  if (!raw?.trim()) return entries;

  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    const id = Number(trimmed.slice(0, separator));
    if (separator < 1 || !Number.isInteger(id) || id < 1 || id > 255) {
      console.error(`${PREVIOUS_KEYS_ENV} entries must be "id:base64" with id from 1 to 255`);
      throw misconfigured();
    }
    entries.set(id, trimmed.slice(separator + 1));
  }
  return entries;
}

async function keyForId(id: number): Promise<CryptoKey> {
  const active = await activeKey();
  if (id === active.id) return active.key;

  const previous = previousKeyEntries().get(id);
  if (!previous) {
    // Same generic error as a failed decrypt: an attacker who can write a
    // ciphertext must not learn which key ids are configured.
    console.error(`no key configured for id ${id}; set ${PREVIOUS_KEYS_ENV}`);
    throw unreadable();
  }
  return importKey(previous, `${PREVIOUS_KEYS_ENV} entry ${id}`);
}

/**
 * Every key a version 1 envelope might have been written under: the active one
 * first, because most rows are, then the retired ones in the order they were
 * configured.
 */
async function legacyKeyCandidates(): Promise<CryptoKey[]> {
  const keys = [(await activeKey()).key];
  for (const [id, raw] of previousKeyEntries()) {
    keys.push(await importKey(raw, `${PREVIOUS_KEYS_ENV} entry ${id}`));
  }
  return keys;
}

export interface TokenContext {
  userId: string;
  provider: string;
}

function additionalData(ctx: TokenContext): Uint8Array<ArrayBuffer> {
  return copy(new TextEncoder().encode(`${ctx.userId}:${ctx.provider}`));
}

/** Returns the `\x<hex>` text form PostgREST accepts for a bytea column. */
export async function encryptProviderToken(plaintext: string, ctx: TokenContext): Promise<string> {
  const { id, key } = await activeKey();
  const iv = allocate(IV_BYTES);
  crypto.getRandomValues(iv);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: additionalData(ctx) },
      key,
      copy(new TextEncoder().encode(plaintext)),
    ),
  );

  const envelope = allocate(2 + IV_BYTES + ciphertext.length);
  envelope[0] = FORMAT_VERSION;
  envelope[1] = id;
  envelope.set(iv, 2);
  envelope.set(ciphertext, 2 + IV_BYTES);
  return "\\x" + toHex(envelope);
}

/**
 * Accepts the `\x<hex>` form PostgREST returns for bytea. Every failure is the
 * same generic error: distinguishing them turns GCM into an oracle.
 */
export async function decryptProviderToken(stored: string, ctx: TokenContext): Promise<string> {
  const hex = stored.startsWith("\\x") ? stored.slice(2) : stored;
  const envelope = fromHex(hex);

  const version = envelope[0];
  const headerBytes = version === LEGACY_FORMAT_VERSION ? 1 : 2;

  if (
    envelope.length <= headerBytes + IV_BYTES ||
    (version !== FORMAT_VERSION && version !== LEGACY_FORMAT_VERSION)
  ) {
    throw new ApiError(500, "internal", "stored token is malformed");
  }

  // A version 1 envelope names no key, which means unknown rather than
  // active. Every row written before the key id existed is version 1, so
  // reading them under the active key alone would make the first rotation
  // destroy all of them: exactly the failure the key id was added to prevent,
  // and the opposite of what the runbook promises. GCM authenticates, so a
  // wrong key fails rather than returning rubbish, which is what makes trying
  // each one safe.
  const keys: CryptoKey[] =
    version === LEGACY_FORMAT_VERSION ? await legacyKeyCandidates() : [await keyForId(envelope[1])];

  const iv = copy(envelope.slice(headerBytes, headerBytes + IV_BYTES));
  const ciphertext = copy(envelope.slice(headerBytes + IV_BYTES));

  for (const key of keys) {
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: additionalData(ctx) },
        key,
        ciphertext,
      );
      return new TextDecoder().decode(plaintext);
    } catch {
      // Try the next key. Every exhausted path ends in the same generic error
      // below, so this stays no more of an oracle than a single attempt.
    }
  }
  throw unreadable();
}
