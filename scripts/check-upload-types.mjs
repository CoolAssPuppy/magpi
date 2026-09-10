#!/usr/bin/env node
/** Fails when the upload surface accepts a mime type the extractor cannot read. */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function listBetween(source, startMarker, endMarker, path) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`${path}: could not find ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`${path}: could not find ${endMarker} after ${startMarker}`);

  return [...source.slice(start, end).matchAll(/'([a-z0-9.+-]+\/[a-z0-9.+-]+)'/g)].map(
    (match) => match[1],
  );
}

function main() {
  const acceptedPath = 'web/lib/documents/uploads.ts';
  const extractorPath = 'supabase/functions/_shared/extract.ts';

  const accepted = listBetween(
    readFileSync(resolve(ROOT, acceptedPath), 'utf8'),
    'export const ACCEPTED_MIME_TYPES',
    '] as const;',
    acceptedPath,
  );
  const extractable = listBetween(
    readFileSync(resolve(ROOT, extractorPath), 'utf8'),
    'const EXTRACTORS: Record<string, Extractor> = {',
    '};',
    extractorPath,
  );

  if (accepted.length === 0 || extractable.length === 0) {
    console.error('upload types FAILED: one of the two lists came back empty');
    process.exit(1);
  }

  const unreadable = accepted.filter((type) => !extractable.includes(type));

  if (unreadable.length > 0) {
    console.error(`upload types FAILED: ${unreadable.length} accepted type(s) cannot be read\n`);
    for (const type of unreadable) {
      console.error(`  ${type}  offered by ${acceptedPath}, absent from ${extractorPath}`);
    }
    console.error('\nA type the extractor does not know is a 415 the user waits for.');
    process.exit(1);
  }

  console.log(`upload types: ${accepted.length} accepted, all extractable`);
}

main();
