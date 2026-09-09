import { assert, assertEquals } from '@std/assert';

import { EMBEDDING_DIMENSIONS, MODELS } from './models.ts';

/**
 * The web app and the edge functions run on different runtimes and cannot share
 * a module, so the pinned ids are written in two files. This reads the web one
 * as text and fails when the two drift, which is the only thing standing between
 * a chat model changing in one place and a silent behavior change in the other.
 */
const WEB_MODELS = new URL('../../../web/lib/models.ts', import.meta.url);

async function webSource(): Promise<string> {
  return await Deno.readTextFile(WEB_MODELS);
}

/** The `key: 'value'` pairs inside the MODELS object literal. */
function parseModels(source: string): Record<string, string> {
  const block = /export const MODELS\s*=\s*\{([\s\S]*?)\}\s*as const;/.exec(source);
  assert(block, 'web/lib/models.ts no longer declares MODELS as an object literal');

  const entries: Record<string, string> = {};
  for (const match of block[1].matchAll(/^\s*(\w+)\s*:\s*'([^']+)'\s*,?\s*$/gm)) {
    entries[match[1]] = match[2];
  }
  return entries;
}

Deno.test('the web app and the edge functions pin the same model ids', async () => {
  const web = parseModels(await webSource());
  assert(Object.keys(web).length > 0, 'no model ids were parsed out of web/lib/models.ts');
  assertEquals(web, { ...MODELS });
});

Deno.test('the web app and the edge functions agree on the embedding dimension', async () => {
  const match = /export const EMBEDDING_DIMENSIONS\s*=\s*(\d+)/.exec(await webSource());
  assert(match, 'web/lib/models.ts no longer declares EMBEDDING_DIMENSIONS');
  assertEquals(Number(match[1]), EMBEDDING_DIMENSIONS);
});

Deno.test('every id is exact, never a floating alias', () => {
  for (const [purpose, id] of Object.entries(MODELS)) {
    assert(!id.includes('latest'), `${purpose} uses a floating alias`);
    assert(/^[a-z0-9.-]+$/.test(id), `${purpose} is not a plain model id`);
  }
});

Deno.test('the embedding model is the one the chunks column was sized for', () => {
  assertEquals(MODELS.embedding, 'text-embedding-3-small');
  assertEquals(EMBEDDING_DIMENSIONS, 1536);
});
