#!/usr/bin/env node
/** Rebuilds supabase/corpus/manifest.json from the files on disk. */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = join(ROOT, 'supabase/corpus');
const ORG = 'supaphone';

/** Filename prefix to source. Anything else is a file nobody has classified. */
const SOURCES = {
  slack: 'slack',
  linear: 'linear',
  notion: 'notion',
  drive: 'drive',
  upload: 'upload',
  personal: 'upload',
};

/**
 * Who a person-uploaded document is attributed to. A synced source has no uploader, so only the
 * upload folders appear here, and each address is a member of the space it writes into.
 */
const UPLOADERS = {
  company: 'jane@example.com',
  marketing: 'maya@example.com',
  engineering: 'sam@example.com',
  finance: 'john@example.com',
  'personal-jane': 'jane@example.com',
  'personal-sam': 'sam@example.com',
  'personal-john': 'john@example.com',
};

const SPACES = Object.keys(UPLOADERS);

const URL_FOR = {
  slack: (org, slug) => `https://${org}.slack.com/archives/${slug}`,
  linear: (org, slug) => `https://linear.app/${org}/issue/${slug.toUpperCase()}`,
  notion: (org, slug) => `https://www.notion.so/${org}/${slug}`,
  drive: (_org, slug) => `https://docs.google.com/document/d/${slug}`,
  upload: () => null,
};

/** A scan has no heading, so it gets called what the file is called, like it would be in Drive. */
const fromSlug = (slug) => {
  const words = slug
    .replace(/^[a-z]+-/, '')
    .replace(/-/g, ' ')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const titleOf = (body, slug) => {
  // A Linear export leads with "ENG-212 · Title". Both halves belong in the title.
  const heading = /^#\s+(.+)$/m.exec(body);
  return heading ? heading[1].trim() : fromSlug(slug);
};

/** The last date the document mentions, so ordering in the app matches the story. */
const updatedAtOf = (body, name) => {
  const fromName = /(\d{4}-\d{2}-\d{2})/.exec(name);
  const dates = [...body.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  if (fromName) dates.push(fromName[1]);
  const latest = dates.sort().at(-1) ?? '2026-09-01';
  return `${latest}T09:00:00.000Z`;
};

function main() {
  const entries = [];

  for (const space of SPACES) {
    const dir = join(CORPUS, space);
    let names;
    try {
      names = readdirSync(dir)
        .filter((n) => n.endsWith('.md'))
        .sort();
    } catch {
      continue;
    }

    for (const name of names) {
      const path = `${space}/${name}`;
      if (!statSync(join(CORPUS, path)).isFile()) continue;

      const prefix = name.split('-')[0];
      const source = SOURCES[prefix];
      if (!source) throw new Error(`${path} has no recognised source prefix`);

      const body = readFileSync(join(CORPUS, path), 'utf8');
      const slug = name.replace(/\.md$/, '');

      entries.push({
        path,
        title: titleOf(body, slug),
        space,
        source,
        // Derived from the path, so adding a document does not renumber every other one and
        // make the seeder insert the whole corpus again.
        externalId: `${space}/${slug}`,
        url: URL_FOR[source](ORG, slug),
        updatedAt: updatedAtOf(body, name),
        // Null for a synced source, the same as the real ingest path leaves it.
        author: source === 'upload' ? UPLOADERS[space] : null,
      });
    }
  }

  writeFileSync(join(CORPUS, 'manifest.json'), `${JSON.stringify(entries, null, 2)}\n`);

  const perSpace = {};
  const perSource = {};
  for (const entry of entries) {
    perSpace[entry.space] = (perSpace[entry.space] ?? 0) + 1;
    perSource[entry.source] = (perSource[entry.source] ?? 0) + 1;
  }

  console.log(`manifest: ${entries.length} documents`);
  for (const [space, n] of Object.entries(perSpace)) console.log(`  ${space.padEnd(16)} ${n}`);
  console.log('');
  for (const [source, n] of Object.entries(perSource)) console.log(`  ${source.padEnd(16)} ${n}`);
}

main();
