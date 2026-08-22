import { assert, assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { ApiError } from "./errors.ts";
import { decryptProviderToken, encryptProviderToken } from "./provider_tokens.ts";

const KEY_ENV = "TOKEN_ENCRYPTION_KEY";

function randomKeyBase64(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Runs a body with a given key configured, restoring the environment after. */
async function withKey(key: string | null, body: () => Promise<void>): Promise<void> {
  const previous = Deno.env.get(KEY_ENV);
  if (key === null) Deno.env.delete(KEY_ENV);
  else Deno.env.set(KEY_ENV, key);
  try {
    await body();
  } finally {
    if (previous === undefined) Deno.env.delete(KEY_ENV);
    else Deno.env.set(KEY_ENV, previous);
  }
}

const KEY_ID_ENV = "TOKEN_ENCRYPTION_KEY_ID";
const PREVIOUS_KEYS_ENV = "TOKEN_ENCRYPTION_KEYS_PREVIOUS";

/** Sets several variables at once, restoring all of them afterwards. */
async function withEnv(vars: Record<string, string | null>, body: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const name of Object.keys(vars)) previous.set(name, Deno.env.get(name));
  try {
    for (const [name, value] of Object.entries(vars)) {
      if (value === null) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
    await body();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

/** The pre-rotation layout: version byte, IV, ciphertext. No key id. */
async function legacyEnvelope(
  plaintext: string,
  keyBase64: string,
  ctx: { userId: string; provider: string },
): Promise<string> {
  const raw = atob(keyBase64);
  const keyBytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) keyBytes[i] = raw.charCodeAt(i);

  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);

  const encoded = new TextEncoder().encode(plaintext);
  const message = new Uint8Array(new ArrayBuffer(encoded.length));
  message.set(encoded);

  const aadSource = new TextEncoder().encode(`${ctx.userId}:${ctx.provider}`);
  const aad = new Uint8Array(new ArrayBuffer(aadSource.length));
  aad.set(aadSource);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, message),
  );

  const envelope = new Uint8Array(new ArrayBuffer(1 + 12 + ciphertext.length));
  envelope[0] = 1;
  envelope.set(iv, 1);
  envelope.set(ciphertext, 13);
  return "\\x" + [...envelope].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CTX = { userId: "user-1", provider: "github" };

Deno.test("a token round trips through encryption", async () => {
  await withKey(randomKeyBase64(), async () => {
    const stored = await encryptProviderToken("gho_secret_value", CTX);
    assertEquals(await decryptProviderToken(stored, CTX), "gho_secret_value");
  });
});

Deno.test("ciphertext is stored in the bytea hex form and carries no plaintext", async () => {
  await withKey(randomKeyBase64(), async () => {
    const stored = await encryptProviderToken("gho_secret_value", CTX);
    assert(stored.startsWith("\\x"));
    assert(/^\\x[0-9a-f]+$/.test(stored));
    assert(!stored.includes("gho_secret_value"));
    // Version byte, key id, 12-byte IV, and a 16-byte tag are always present.
    assert(stored.length - 2 >= (2 + 12 + 16) * 2);
  });
});

Deno.test("encrypting the same value twice yields different ciphertext", async () => {
  await withKey(randomKeyBase64(), async () => {
    const a = await encryptProviderToken("same", CTX);
    const b = await encryptProviderToken("same", CTX);
    // A fresh IV per encryption, so the ciphertext is not a stable
    // fingerprint an observer could match across rows.
    assertNotEquals(a, b);
    assertEquals(await decryptProviderToken(a, CTX), "same");
    assertEquals(await decryptProviderToken(b, CTX), "same");
  });
});

Deno.test("a ciphertext cannot be moved to another user's row", async () => {
  await withKey(randomKeyBase64(), async () => {
    const stored = await encryptProviderToken("gho_victim", CTX);
    await assertRejects(
      () => decryptProviderToken(stored, { userId: "attacker", provider: "github" }),
      ApiError,
    );
  });
});

Deno.test("a ciphertext cannot be reused under another provider", async () => {
  await withKey(randomKeyBase64(), async () => {
    const stored = await encryptProviderToken("gho_victim", CTX);
    await assertRejects(
      () => decryptProviderToken(stored, { userId: "user-1", provider: "supabase" }),
      ApiError,
    );
  });
});

Deno.test("a tampered ciphertext is rejected rather than decrypted", async () => {
  await withKey(randomKeyBase64(), async () => {
    const stored = await encryptProviderToken("gho_secret", CTX);
    // Flip the last nibble, which lands inside the authentication tag.
    const flipped = stored.slice(0, -1) + (stored.at(-1) === "0" ? "1" : "0");
    await assertRejects(() => decryptProviderToken(flipped, CTX), ApiError);
  });
});

Deno.test("a ciphertext from a different key does not decrypt", async () => {
  let stored = "";
  await withKey(randomKeyBase64(), async () => {
    stored = await encryptProviderToken("gho_secret", CTX);
  });
  await withKey(randomKeyBase64(), async () => {
    await assertRejects(() => decryptProviderToken(stored, CTX), ApiError);
  });
});

Deno.test("a malformed stored value is rejected", async () => {
  await withKey(randomKeyBase64(), async () => {
    for (const bad of ["\\x", "\\xzz", "\\x00", "not hex at all", "\\x0102030405"]) {
      await assertRejects(() => decryptProviderToken(bad, CTX), ApiError);
    }
  });
});

Deno.test("an unknown envelope version is rejected", async () => {
  await withKey(randomKeyBase64(), async () => {
    const stored = await encryptProviderToken("gho_secret", CTX);
    // 1 and 2 are the formats this understands, so reach past both.
    const bumped = "\\x7f" + stored.slice(4);
    await assertRejects(() => decryptProviderToken(bumped, CTX), ApiError);
  });
});

Deno.test("a missing or wrong-sized key fails closed", async () => {
  await withKey(null, async () => {
    await assertRejects(() => encryptProviderToken("x", CTX), ApiError, "not configured");
  });
  await withKey(btoa("too short"), async () => {
    await assertRejects(() => encryptProviderToken("x", CTX), ApiError, "not configured");
  });
  await withKey("!!! not base64 !!!", async () => {
    await assertRejects(() => encryptProviderToken("x", CTX), ApiError, "not configured");
  });
});

Deno.test("failures do not distinguish a wrong key from a wrong row", async () => {
  await withKey(randomKeyBase64(), async () => {
    const stored = await encryptProviderToken("gho_secret", CTX);
    const wrongRow = await assertRejects(
      () => decryptProviderToken(stored, { userId: "other", provider: "github" }),
      ApiError,
    );
    // Flip the last byte rather than assigning a constant. Setting it to "ff"
    // leaves a ciphertext that already ended in ff tampered into itself, so it
    // decrypts cleanly and this rejects nothing, once every 256 runs. That is
    // exactly how it failed in CI while passing locally.
    const lastByte = parseInt(stored.slice(-2), 16);
    const tamperedTail = (lastByte ^ 0xff).toString(16).padStart(2, "0");
    const tampered = await assertRejects(
      () => decryptProviderToken(stored.slice(0, -2) + tamperedTail, CTX),
      ApiError,
    );
    // Same code and same message: authentication failure is not an oracle.
    assertEquals(wrongRow.code, tampered.code);
    assertEquals(wrongRow.message, tampered.message);
  });
});

// --- Key rotation ---------------------------------------------------------
//
// Version 1 named no key, so changing TOKEN_ENCRYPTION_KEY made every stored
// connection permanently unreadable. These pin the property that replaced it:
// a row records which key wrote it, and a retired key can still read its own.

Deno.test("the envelope names the key that wrote it", async () => {
  await withEnv({ [KEY_ENV]: randomKeyBase64(), [KEY_ID_ENV]: "7" }, async () => {
    const stored = await encryptProviderToken("gho_secret", CTX);
    // "\x" then the version byte, then the key id.
    assertEquals(stored.slice(2, 4), "02");
    assertEquals(stored.slice(4, 6), "07");
  });
});

Deno.test("a token written under a previous key still decrypts after rotation", async () => {
  const oldKey = randomKeyBase64();
  const newKey = randomKeyBase64();
  let stored = "";

  await withEnv({ [KEY_ENV]: oldKey, [KEY_ID_ENV]: "1", [PREVIOUS_KEYS_ENV]: null }, async () => {
    stored = await encryptProviderToken("gho_secret", CTX);
  });

  await withEnv(
    { [KEY_ENV]: newKey, [KEY_ID_ENV]: "2", [PREVIOUS_KEYS_ENV]: `1:${oldKey}` },
    async () => {
      assertEquals(await decryptProviderToken(stored, CTX), "gho_secret");
      // And a fresh write goes under the new key, not the retired one.
      const rewritten = await encryptProviderToken("gho_secret", CTX);
      assertEquals(rewritten.slice(4, 6), "02");
    },
  );
});

Deno.test("a ciphertext naming a key that is not configured fails closed", async () => {
  const oldKey = randomKeyBase64();
  let stored = "";
  await withEnv({ [KEY_ENV]: oldKey, [KEY_ID_ENV]: "1", [PREVIOUS_KEYS_ENV]: null }, async () => {
    stored = await encryptProviderToken("gho_secret", CTX);
  });

  // Rotated without carrying the old key across, which is the mistake the
  // key id exists to make visible rather than silent.
  await withEnv(
    { [KEY_ENV]: randomKeyBase64(), [KEY_ID_ENV]: "2", [PREVIOUS_KEYS_ENV]: null },
    async () => {
      await assertRejects(() => decryptProviderToken(stored, CTX), ApiError);
    },
  );
});

Deno.test("a version 1 envelope still decrypts under the active key", async () => {
  const key = randomKeyBase64();
  const legacy = await legacyEnvelope("gho_legacy", key, CTX);

  await withEnv({ [KEY_ENV]: key, [KEY_ID_ENV]: null, [PREVIOUS_KEYS_ENV]: null }, async () => {
    assertEquals(await decryptProviderToken(legacy, CTX), "gho_legacy");
  });
});

Deno.test("a version 1 envelope is still bound to its row", async () => {
  const key = randomKeyBase64();
  const legacy = await legacyEnvelope("gho_legacy", key, CTX);

  await withEnv({ [KEY_ENV]: key, [KEY_ID_ENV]: null, [PREVIOUS_KEYS_ENV]: null }, async () => {
    await assertRejects(
      () => decryptProviderToken(legacy, { userId: "attacker", provider: "github" }),
      ApiError,
    );
  });
});

Deno.test("a malformed previous-key entry is fatal rather than skipped", async () => {
  // Skipping it would turn a typo during rotation into rows that quietly stop
  // decrypting, which is the failure this mechanism exists to prevent.
  const oldKey = randomKeyBase64();
  let stored = "";
  await withEnv({ [KEY_ENV]: oldKey, [KEY_ID_ENV]: "1", [PREVIOUS_KEYS_ENV]: null }, async () => {
    stored = await encryptProviderToken("gho_secret", CTX);
  });

  await withEnv(
    { [KEY_ENV]: randomKeyBase64(), [KEY_ID_ENV]: "2", [PREVIOUS_KEYS_ENV]: "nonsense" },
    async () => {
      await assertRejects(() => decryptProviderToken(stored, CTX), ApiError);
    },
  );
});

Deno.test("an out-of-range key id fails closed rather than wrapping to a byte", async () => {
  for (const bad of ["0", "256", "-1", "1.5", "abc"]) {
    await withEnv({ [KEY_ENV]: randomKeyBase64(), [KEY_ID_ENV]: bad }, async () => {
      await assertRejects(() => encryptProviderToken("x", CTX), ApiError, "not configured");
    });
  }
});

Deno.test("a version 1 envelope survives a rotation, which is the whole point", async () => {
  // Every row written before the key id existed is version 1. Reading those
  // under the active key alone would make the first rotation destroy all of
  // them, which is the failure the key id was added to prevent and the
  // opposite of what the runbook in .env.example promises.
  const oldKey = randomKeyBase64();
  const legacy = await legacyEnvelope("gho_from_before_rotation", oldKey, CTX);

  await withEnv(
    { [KEY_ENV]: randomKeyBase64(), [KEY_ID_ENV]: "2", [PREVIOUS_KEYS_ENV]: `1:${oldKey}` },
    async () => {
      assertEquals(await decryptProviderToken(legacy, CTX), "gho_from_before_rotation");
    },
  );
});

Deno.test("a version 1 envelope under no configured key still fails closed", async () => {
  const legacy = await legacyEnvelope("gho_orphan", randomKeyBase64(), CTX);

  await withEnv(
    {
      [KEY_ENV]: randomKeyBase64(),
      [KEY_ID_ENV]: "2",
      [PREVIOUS_KEYS_ENV]: `1:${randomKeyBase64()}`,
    },
    async () => {
      await assertRejects(() => decryptProviderToken(legacy, CTX), ApiError);
    },
  );
});

Deno.test("trying several keys does not weaken the row binding", async () => {
  // The AAD check has to survive the retry loop: a legacy row must not become
  // readable from another user's row just because more keys are tried.
  const oldKey = randomKeyBase64();
  const legacy = await legacyEnvelope("gho_victim", oldKey, CTX);

  await withEnv(
    { [KEY_ENV]: randomKeyBase64(), [KEY_ID_ENV]: "2", [PREVIOUS_KEYS_ENV]: `1:${oldKey}` },
    async () => {
      await assertRejects(
        () => decryptProviderToken(legacy, { userId: "attacker", provider: "github" }),
        ApiError,
      );
    },
  );
});
