import { assertEquals } from '@std/assert';

import {
  connectionsBeginSchema,
  dreamRunSchema,
  ingestEnqueueSchema,
  isUploadInSpace,
  isValidSlug,
  parseBody,
  workerBatchSchema,
} from './validate.ts';
import { apiErrorFrom } from './testing/assertions.ts';

const SPACE = '33333333-3333-4333-8333-333333333333';

Deno.test('beginning a connection names a provider and a space', () => {
  const parsed = parseBody(connectionsBeginSchema, { provider: 'notion', space_id: SPACE });
  assertEquals(parsed.space_id, SPACE);
});

Deno.test('a connection cannot be started without a space', () => {
  const err = apiErrorFrom(() => parseBody(connectionsBeginSchema, { provider: 'notion' }));
  assertEquals(err.status, 400);
  assertEquals(err.code, 'invalid_request');
});

Deno.test('an unknown key is rejected rather than stripped', () => {
  // Otherwise a handler that spreads the parsed object carries it through.
  const err = apiErrorFrom(() =>
    parseBody(connectionsBeginSchema, { provider: 'notion', space_id: SPACE, org_id: SPACE })
  );
  assertEquals(err.status, 400);
});

Deno.test('the failure names the field so the caller can fix it', () => {
  const err = apiErrorFrom(() => parseBody(connectionsBeginSchema, { provider: 'NOT A SLUG' }));
  assertEquals(JSON.stringify(err.detail).includes('provider'), true);
});

Deno.test('an upload names its space, its bytes and its type', () => {
  const parsed = parseBody(ingestEnqueueSchema, {
    space_id: SPACE,
    storage_path: 'uploads/report.pdf',
    title: '  Q3 report  ',
    mime_type: 'application/pdf',
  });
  assertEquals(parsed.title, 'Q3 report');
});

Deno.test('a worker batch is bounded so one call cannot ask for unbounded work', () => {
  assertEquals(parseBody(workerBatchSchema, { batch: 10 }).batch, 10);
  apiErrorFrom(() => parseBody(workerBatchSchema, { batch: 1000 }));
  assertEquals(parseBody(workerBatchSchema, {}).batch, undefined);
});

Deno.test('a dream run names one space and one of the three kinds', () => {
  assertEquals(parseBody(dreamRunSchema, { space_id: SPACE, kind: 'digest' }).kind, 'digest');
  apiErrorFrom(() => parseBody(dreamRunSchema, { space_id: SPACE, kind: 'summarise' }));
});

Deno.test('a slug that could climb a path is not a slug', () => {
  assertEquals(isValidSlug('google-drive'), true);
  assertEquals(isValidSlug('../etc'), false);
  assertEquals(isValidSlug('-leading'), false);
  assertEquals(isValidSlug('a'.repeat(65)), false);
});

Deno.test('an upload is only accepted under the space that owns it', () => {
  assertEquals(isUploadInSpace(`${SPACE}/doc-1/report.pdf`, SPACE), true);
});

Deno.test('an upload pointing at another space is refused', () => {
  const other = '99999999-9999-4999-8999-999999999999';
  assertEquals(isUploadInSpace(`${other}/doc-1/report.pdf`, SPACE), false);
  assertEquals(isUploadInSpace(`${SPACE}-decoy/doc-1/report.pdf`, SPACE), false);
});

Deno.test('a path that could climb out of its space is refused', () => {
  assertEquals(isUploadInSpace(`${SPACE}/../other/report.pdf`, SPACE), false);
  assertEquals(isUploadInSpace(`/${SPACE}/report.pdf`, SPACE), false);
  assertEquals(isUploadInSpace(`${SPACE}/`, SPACE), false);
  assertEquals(isUploadInSpace(SPACE, SPACE), false);
});
