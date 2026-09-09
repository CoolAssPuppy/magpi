// Encryption at rest for provider tokens. AES-256-GCM via WebCrypto, key from
// SB_TOKEN_ENC_KEY.
//
// Not pgsodium: its transparent column encryption is deprecated on the platform
// and would put the plaintext inside Postgres, where it reaches query logs and
// `explain` output.
//
// Envelope layout, stored in the bytea column:
//
//   byte 0        format version
//   byte 1        key id
//   bytes 2..13   random 96-bit IV
//   bytes 14..    ciphertext with its 128-bit tag
//
// The AAD is `${user_id}:${provider}`, so an attacker with write access to
// connections cannot move another user's ciphertext into their own row.
//
// The key id byte is what makes rotation a migration rather than a data loss
// event, and it cannot be added later because existing rows would not carry it.
// Rotating: move the current key into SB_TOKEN_ENC_KEYS_PREVIOUS as `id:key`,
// set SB_TOKEN_ENC_KEY to the new one, bump SB_TOKEN_ENC_KEY_ID. New writes use
// the new key, old rows still decrypt, and the previous entry is dropped once
// every row has been rewritten.

import { ApiError, misconfigured } from './errors.ts';
import { denoEnv, type EnvSource, tokenEncryptionEnv } from './env.ts';
import { toHex } from './crypto.ts';

const FORMAT_VERSION = 2;
const IV_BYTES = 12;
const KEY_BYTES = 32;

// Keyed by the raw base64, so rotating a secret in place is picked up rather
// than served from a stale import.
const keyCache = new Map<string, CryptoKey>();

function unreadable(): ApiError {
  return new ApiError(500, 'internal', 'stored token could not be read');
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

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new ApiError(500, 'internal', 'stored token is malformed');
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
    throw misconfigured(`${label} is not valid base64`);
  }
  if (bytes.length !== KEY_BYTES) {
    throw misconfigured(`${label} must decode to ${KEY_BYTES} bytes, got ${bytes.length}`);
  }

  // extractable = false: the key material cannot be read back out, so it cannot
  // reach a log line or a response body.
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  keyCache.set(raw, key);
  return key;
}

export interface TokenContext {
  userId: string;
  provider: string;
}

function additionalData(ctx: TokenContext): Uint8Array<ArrayBuffer> {
  return copy(new TextEncoder().encode(`${ctx.userId}:${ctx.provider}`));
}

/** Returns the `\x<hex>` text form PostgREST accepts for a bytea column. */
export async function encryptProviderToken(
  plaintext: string,
  ctx: TokenContext,
  source: EnvSource = denoEnv,
): Promise<string> {
  const env = tokenEncryptionEnv(source);
  const key = await importKey(env.key, 'SB_TOKEN_ENC_KEY');
  const iv = allocate(IV_BYTES);
  crypto.getRandomValues(iv);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(ctx) },
      key,
      copy(new TextEncoder().encode(plaintext)),
    ),
  );

  const envelope = allocate(2 + IV_BYTES + ciphertext.length);
  envelope[0] = FORMAT_VERSION;
  envelope[1] = env.keyId;
  envelope.set(iv, 2);
  envelope.set(ciphertext, 2 + IV_BYTES);
  return '\\x' + toHex(envelope);
}

/**
 * Accepts the `\x<hex>` form PostgREST returns for bytea. Every failure is the
 * same generic error: telling them apart turns GCM into an oracle.
 */
export async function decryptProviderToken(
  stored: string,
  ctx: TokenContext,
  source: EnvSource = denoEnv,
): Promise<string> {
  const envelope = fromHex(stored.startsWith('\\x') ? stored.slice(2) : stored);

  if (envelope.length <= 2 + IV_BYTES || envelope[0] !== FORMAT_VERSION) {
    throw new ApiError(500, 'internal', 'stored token is malformed');
  }

  const env = tokenEncryptionEnv(source);
  const keyId = envelope[1];
  const raw = keyId === env.keyId ? env.key : env.previousKeys.get(keyId);
  if (!raw) {
    // Same generic error as a failed decrypt: someone who can write a ciphertext
    // must not learn which key ids are configured.
    console.error(`no key configured for id ${keyId}; set SB_TOKEN_ENC_KEYS_PREVIOUS`);
    throw unreadable();
  }

  const key = await importKey(
    raw,
    keyId === env.keyId ? 'SB_TOKEN_ENC_KEY' : `SB_TOKEN_ENC_KEYS_PREVIOUS entry ${keyId}`,
  );

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: copy(envelope.slice(2, 2 + IV_BYTES)),
        additionalData: additionalData(ctx),
      },
      key,
      copy(envelope.slice(2 + IV_BYTES)),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw unreadable();
  }
}
