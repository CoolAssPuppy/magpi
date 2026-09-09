import { assert, assertEquals, assertRejects } from '@std/assert';

import { ApiError } from './errors.ts';
import { envSource } from './testing/assertions.ts';
import { decryptProviderToken, encryptProviderToken } from './provider_tokens.ts';

const KEY_A = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=';
const KEY_B = '//79/Pv6+fj39vX08/Lx8O/u7ezr6uno5+bl5OPi4eA=';

const source = envSource;

const CTX = { userId: '11111111-1111-4111-8111-111111111111', provider: 'notion' };
const CURRENT = source({ SB_TOKEN_ENC_KEY: KEY_A, SB_TOKEN_ENC_KEY_ID: '1' });

Deno.test('a token round trips through the envelope', async () => {
  const stored = await encryptProviderToken('ntn_live_secret', CTX, CURRENT);
  assert(stored.startsWith('\\x'), 'bytea columns take the \\x hex form');
  assertEquals(await decryptProviderToken(stored, CTX, CURRENT), 'ntn_live_secret');
});

Deno.test('the ciphertext never contains the plaintext', async () => {
  const stored = await encryptProviderToken('ntn_live_secret', CTX, CURRENT);
  assert(!stored.includes('6e746e5f6c6976655f736563726574'));
});

Deno.test('the envelope names the key that wrote it', async () => {
  const stored = await encryptProviderToken(
    'token',
    CTX,
    source({ SB_TOKEN_ENC_KEY: KEY_A, SB_TOKEN_ENC_KEY_ID: '9' }),
  );
  assertEquals(stored.slice(2, 6), '0209');
});

Deno.test('another user cannot read a token filed under someone else', async () => {
  const stored = await encryptProviderToken('ntn_live_secret', CTX, CURRENT);
  await assertRejects(
    () =>
      decryptProviderToken(
        stored,
        { userId: '22222222-2222-4222-8222-222222222222', provider: 'notion' },
        CURRENT,
      ),
    ApiError,
  );
});

Deno.test('a token cannot be moved to another provider on the same account', async () => {
  const stored = await encryptProviderToken('ntn_live_secret', CTX, CURRENT);
  await assertRejects(
    () => decryptProviderToken(stored, { userId: CTX.userId, provider: 'linear' }, CURRENT),
    ApiError,
  );
});

Deno.test('a row written under a retired key still decrypts after rotation', async () => {
  const stored = await encryptProviderToken(
    'written_before_rotation',
    CTX,
    source({ SB_TOKEN_ENC_KEY: KEY_A, SB_TOKEN_ENC_KEY_ID: '1' }),
  );

  const afterRotation = source({
    SB_TOKEN_ENC_KEY: KEY_B,
    SB_TOKEN_ENC_KEY_ID: '2',
    SB_TOKEN_ENC_KEYS_PREVIOUS: `1:${KEY_A}`,
  });

  assertEquals(await decryptProviderToken(stored, CTX, afterRotation), 'written_before_rotation');
  assertEquals((await encryptProviderToken('new', CTX, afterRotation)).slice(2, 6), '0202');
});

Deno.test('a row whose key was dropped fails rather than returning rubbish', async () => {
  const stored = await encryptProviderToken('orphan', CTX, CURRENT);
  await assertRejects(
    () =>
      decryptProviderToken(
        stored,
        CTX,
        source({ SB_TOKEN_ENC_KEY: KEY_B, SB_TOKEN_ENC_KEY_ID: '2' }),
      ),
    ApiError,
  );
});

Deno.test('a truncated envelope is refused', async () => {
  await assertRejects(() => decryptProviderToken('\\x0201aabb', CTX, CURRENT), ApiError);
});

Deno.test('a key that is not 32 bytes is a misconfiguration', async () => {
  await assertRejects(
    () => encryptProviderToken('t', CTX, source({ SB_TOKEN_ENC_KEY: 'c2hvcnQ=' })),
    ApiError,
  );
});
