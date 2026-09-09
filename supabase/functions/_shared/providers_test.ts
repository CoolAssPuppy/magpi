import { assertEquals } from '@std/assert';

import {
  loadProvider,
  type ProviderRecord,
  requireEnabledProvider,
  requireOAuthProvider,
} from './providers.ts';
import { stubDb } from './testing/stub_db.ts';
import { apiErrorFrom } from './testing/assertions.ts';

function record(overrides: Partial<ProviderRecord> = {}): ProviderRecord {
  return {
    slug: 'notion',
    display_name: 'Notion',
    description: 'Pages and databases',
    kind: 'oauth',
    auth_url: 'https://api.notion.com/v1/oauth/authorize',
    token_url: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    docs_url: null,
    enabled: true,
    position: 1,
    scope_selection_kind: 'workspace',
    ...overrides,
  };
}

Deno.test('a provider is read from the registry, not from a constant', async () => {
  const stub = stubDb(() => ({ body: [record()] }));
  try {
    const found = await loadProvider(stub.db, 'notion');
    assertEquals(found?.slug, 'notion');
    assertEquals(found?.scope_selection_kind, 'workspace');
    assertEquals(stub.requests[0].query.includes('slug=eq.notion'), true);
  } finally {
    await stub.close();
  }
});

Deno.test('a missing provider and a disabled one are one answer', () => {
  // Otherwise the registry can be walked for slugs that exist but are off.
  const missing = apiErrorFrom(() => requireEnabledProvider(null));
  const disabled = apiErrorFrom(() => requireEnabledProvider(record({ enabled: false })));
  assertEquals(missing.status, 404);
  assertEquals(disabled.code, missing.code);
});

Deno.test('an api key provider is refused by name rather than sent to an undefined url', () => {
  const err = apiErrorFrom(() =>
    requireOAuthProvider(record({ kind: 'api_key', auth_url: null, token_url: null }))
  );
  assertEquals(err.status, 400);
  assertEquals(err.code, 'provider_not_oauth');
});

Deno.test("an oauth row missing its endpoints is a server fault, not the caller's", () => {
  const err = apiErrorFrom(() => requireOAuthProvider(record({ auth_url: null })));
  assertEquals(err.status, 500);
});

Deno.test('a narrowed oauth provider carries non-null endpoints', () => {
  const provider = requireOAuthProvider(record());
  assertEquals(provider.token_url, 'https://api.notion.com/v1/oauth/token');
});
