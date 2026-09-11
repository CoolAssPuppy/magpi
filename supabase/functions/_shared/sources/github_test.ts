import { assert, assertEquals } from '@std/assert';

import type { SourceCredentials } from './contract.ts';
import { SourceError } from './contract.ts';
import { githubDriver } from './github.ts';
import { parsePosition } from './github_cursor.ts';
import { loadFixture, type StubCall, type StubRoute, stubSource } from './testing/http_stub.ts';

const TOKEN = 'gho_2b7f41d0c9a64e83b5107f6a';
const BRAIN = 'prashant/brain';
const ARCHIVE = 'prashant/notes-archive';
const HEAD = '9c1f0a4b7d2e5c8a3f6b1d0e4a7c2b9f5e8d3a06';
const MOVED = '1a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d';

function creds(ids: string[] = [BRAIN]): SourceCredentials {
  return { accessToken: TOKEN, scopeSelection: { ids } };
}

function matching(pattern: RegExp, body: unknown): StubRoute {
  return { when: (call: StubCall) => pattern.test(call.url), body };
}

/** The three reads a first walk of one repository makes, answered from the recorded fixtures. */
async function walkRoutes(repo = BRAIN): Promise<StubRoute[]> {
  return [
    matching(
      new RegExp(`/repos/${repo}/commits\\?`),
      await loadFixture('github', 'commit_head'),
    ),
    matching(new RegExp(`/repos/${repo}/git/trees/`), await loadFixture('github', 'tree')),
  ];
}

function pathsOf(documents: { externalId: string }[]): string[] {
  return documents.map((document) => document.externalId.split(':')[1]);
}

Deno.test('a first pass reads the whole tree at one commit', async () => {
  const deps = stubSource(await walkRoutes());

  const page = await githubDriver.listChanges(creds(), deps, { cursor: null });

  assertEquals(deps.calls[0].url, `https://api.github.com/repos/${BRAIN}/commits?per_page=1`);
  assertEquals(
    deps.calls[1].url,
    `https://api.github.com/repos/${BRAIN}/git/trees/${HEAD}?recursive=1`,
  );
  assertEquals(pathsOf(page.documents), [
    'README.md',
    'docs/field-marketing.mdx',
    'docs/notes.txt',
    'docs/positioning.md',
  ]);
  assertEquals(page.hasMore, false);
  assertEquals(parsePosition(page.cursor).heads[BRAIN], HEAD);
});

// The tree fixture holds one of each thing a repository has that is not prose.
Deno.test('code, lockfiles, vendored trees and dot directories are not documents', async () => {
  const deps = stubSource(await walkRoutes());

  const page = await githubDriver.listChanges(creds(), deps, { cursor: null });

  const paths = pathsOf(page.documents);
  assertEquals(paths.includes('src/index.ts'), false);
  assertEquals(paths.includes('package-lock.json'), false);
  assertEquals(paths.includes('node_modules/left-pad/README.md'), false);
  assertEquals(paths.includes('.github/workflows/ci.md'), false);
  // Four million bytes of markdown is an export, and the contents endpoint refuses it anyway.
  assertEquals(paths.includes('docs/huge-export.md'), false);
});

Deno.test('every file is dated by the commit the tree was read at', async () => {
  const deps = stubSource(await walkRoutes());

  const page = await githubDriver.listChanges(creds(), deps, { cursor: null });

  for (const document of page.documents) {
    assertEquals(document.updatedAt, '2026-09-09T08:12:44.000Z');
  }
});

Deno.test('a document names the repository it came from, so a route can file it', async () => {
  const deps = stubSource(await walkRoutes());

  const page = await githubDriver.listChanges(creds(), deps, { cursor: null });

  assertEquals(page.documents[0].unitId, BRAIN);
  assertEquals(page.documents[0].title, 'README.md');
  // HEAD, not the commit, so a link into a file does not rot on the next push.
  assertEquals(page.documents[0].url, `https://github.com/${BRAIN}/blob/HEAD/README.md`);
  assertEquals(page.documents[0].mimeType, 'text/markdown');
});

Deno.test('a tree larger than one pass resumes where it stopped, at the same commit', async () => {
  const many = {
    sha: HEAD,
    truncated: false,
    tree: Array.from({ length: 420 }, (_, index) => ({
      path: `docs/note-${String(index).padStart(4, '0')}.md`,
      type: 'blob',
      size: 1200,
    })),
  };
  const routes = [
    matching(/\/commits\?/, await loadFixture('github', 'commit_head')),
    matching(/\/git\/trees\//, many),
  ];

  const first = await githubDriver.listChanges(creds(), stubSource(routes), { cursor: null });
  assertEquals(first.documents.length, 300);
  assertEquals(first.hasMore, true);

  const carried = parsePosition(first.cursor);
  assertEquals(carried.walk?.head, HEAD, 'the walk moved off the commit it started on');
  assertEquals(carried.heads[BRAIN], undefined, 'the repository was marked read half way through');

  const second = stubSource(routes);
  const rest = await githubDriver.listChanges(creds(), second, { cursor: first.cursor });

  assertEquals(rest.documents.length, 120);
  assertEquals(rest.hasMore, false);
  assertEquals(parsePosition(rest.cursor).heads[BRAIN], HEAD);
  // The second page does not ask for the newest commit again; the walk carries the one it began on.
  assertEquals(second.calls.length, 1);
  assertEquals(pathsOf(rest.documents)[0], 'docs/note-0300.md');
});

Deno.test('a later pass asks what changed since the commit it read, not for the tree', async () => {
  const deps = stubSource([
    matching(/\/commits\?/, await loadFixture('github', 'commit_head_moved')),
    matching(/\/compare\//, await loadFixture('github', 'compare_changed')),
  ]);
  const cursor = JSON.stringify({ heads: { [BRAIN]: HEAD }, walk: null, resume: '' });

  const page = await githubDriver.listChanges(creds(), deps, { cursor });

  assertEquals(
    deps.calls[1].url,
    `https://api.github.com/repos/${BRAIN}/compare/${HEAD}...${MOVED}`,
  );
  assertEquals(pathsOf(page.documents), ['docs/positioning.md', 'docs/launch-plan.md']);
  assertEquals(page.documents[0].updatedAt, '2026-09-09T11:47:02.000Z');
  assertEquals(parsePosition(page.cursor).heads[BRAIN], MOVED);
  assertEquals(page.hasMore, false);
});

Deno.test('a repository nobody has pushed to costs one request and reads nothing', async () => {
  const deps = stubSource([matching(/\/commits\?/, await loadFixture('github', 'commit_head'))]);
  const cursor = JSON.stringify({ heads: { [BRAIN]: HEAD }, walk: null, resume: '' });

  const page = await githubDriver.listChanges(creds(), deps, { cursor });

  assertEquals(deps.calls.length, 1);
  assertEquals(page.documents.length, 0);
  assertEquals(page.hasMore, false);
});

// A compare only reports three hundred files. A bigger change would silently lose the rest.
Deno.test('a change too large to compare is read as a fresh walk instead', async () => {
  const flood = {
    files: Array.from({ length: 300 }, (_, index) => ({
      filename: `docs/bulk-${index}.md`,
      status: 'modified',
    })),
  };
  const deps = stubSource([
    matching(/\/commits\?/, await loadFixture('github', 'commit_head_moved')),
    matching(/\/compare\//, flood),
  ]);
  const cursor = JSON.stringify({ heads: { [BRAIN]: HEAD }, walk: null, resume: '' });

  const page = await githubDriver.listChanges(creds(), deps, { cursor });

  assertEquals(page.documents.length, 0);
  assertEquals(page.hasMore, true);
  const carried = parsePosition(page.cursor);
  assertEquals(carried.walk?.repo, BRAIN);
  assertEquals(carried.walk?.head, MOVED);
  assertEquals(carried.heads[BRAIN], HEAD, 'the head moved before the new tree was read');
});

Deno.test('a deleted file is not filed as a document', async () => {
  const deps = stubSource([
    matching(/\/commits\?/, await loadFixture('github', 'commit_head_moved')),
    matching(/\/compare\//, await loadFixture('github', 'compare_changed')),
  ]);
  const cursor = JSON.stringify({ heads: { [BRAIN]: HEAD }, walk: null, resume: '' });

  const page = await githubDriver.listChanges(creds(), deps, { cursor });

  assertEquals(pathsOf(page.documents).includes('docs/retired.md'), false);
});

Deno.test('a repository with no commits is marked read rather than asked for every hour', async () => {
  const deps = stubSource([matching(/\/commits\?/, await loadFixture('github', 'commit_none'))]);

  const page = await githubDriver.listChanges(creds(), deps, { cursor: null });

  assertEquals(page.documents.length, 0);
  assertEquals(page.hasMore, false);
  assertEquals(parsePosition(page.cursor).heads[BRAIN], '');
});

Deno.test('two repositories are walked one after the other, not both at once', async () => {
  const routes = [...(await walkRoutes(BRAIN)), ...(await walkRoutes(ARCHIVE))];
  const deps = stubSource(routes);

  const first = await githubDriver.listChanges(creds([BRAIN, ARCHIVE]), deps, { cursor: null });

  assertEquals(new Set(first.documents.map((document) => document.unitId)), new Set([BRAIN]));
  assertEquals(first.hasMore, true, 'the second repository was never going to be read');

  const second = await githubDriver.listChanges(creds([BRAIN, ARCHIVE]), stubSource(routes), {
    cursor: first.cursor,
  });
  assertEquals(new Set(second.documents.map((document) => document.unitId)), new Set([ARCHIVE]));
  assertEquals(second.hasMore, false);
});

Deno.test('a repository that is no longer routed is dropped from the cursor', async () => {
  const deps = stubSource(await walkRoutes());
  const cursor = JSON.stringify({
    heads: { [BRAIN]: HEAD, 'somebody/else': 'aaaa' },
    walk: null,
    resume: '',
  });

  const page = await githubDriver.listChanges(creds([BRAIN]), deps, { cursor });

  assertEquals(Object.keys(parsePosition(page.cursor).heads), [BRAIN]);
});

Deno.test('a walk for a repository that was unrouted mid-walk does not continue', async () => {
  const deps = stubSource(await walkRoutes(ARCHIVE));
  const cursor = JSON.stringify({
    heads: {},
    walk: { repo: 'somebody/else', head: HEAD, stamp: '2026-09-09T08:12:44Z', after: 'a.md' },
    resume: '',
  });

  const page = await githubDriver.listChanges(creds([ARCHIVE]), deps, { cursor });

  assertEquals(new Set(page.documents.map((document) => document.unitId)), new Set([ARCHIVE]));
});

Deno.test('no repository routed reads nothing and leaves the cursor alone', async () => {
  const deps = stubSource([{ when: () => true, body: {} }]);
  const cursor = JSON.stringify({ heads: { [BRAIN]: HEAD }, walk: null, resume: '' });

  const page = await githubDriver.listChanges(creds([]), deps, { cursor });

  assertEquals(deps.calls.length, 0);
  assertEquals(page.cursor, cursor);
  assertEquals(page.hasMore, false);
});

Deno.test('an unreadable cursor reads the repositories again rather than failing', async () => {
  const deps = stubSource(await walkRoutes());

  const page = await githubDriver.listChanges(creds(), deps, { cursor: '{not json' });

  assertEquals(page.documents.length, 4);
});

Deno.test('a file comes back as the text it holds, not as base64', async () => {
  const deps = stubSource([
    matching(/\/contents\//, await loadFixture('github', 'contents_markdown')),
  ]);

  const document = await githubDriver.fetchDocument(creds(), deps, `${BRAIN}:docs/positioning.md`);

  assertEquals(document.text, '# Positioning\n\nWe are the database you want.\n');
  assertEquals(document.mimeType, 'text/markdown');
  assertEquals(document.title, 'docs/positioning.md');
  assertEquals(
    deps.calls[0].url,
    `https://api.github.com/repos/${BRAIN}/contents/docs/positioning.md`,
  );
});

Deno.test('a path that is not a file is refused without asking for a reconnect', async () => {
  const deps = stubSource([
    matching(/\/contents\//, await loadFixture('github', 'contents_directory')),
  ]);

  const error = await githubDriver
    .fetchDocument(creds(), deps, `${BRAIN}:docs`)
    .then(() => null, (thrown) => thrown);

  assert(error instanceof SourceError);
  assertEquals(error.needsReconnect, false);
});

Deno.test('an id from another provider is refused before a request is made', async () => {
  const deps = stubSource([{ when: () => true, body: {} }]);

  const error = await githubDriver
    .fetchDocument(creds(), deps, 'no-colon-here')
    .then(() => null, (thrown) => thrown);

  assert(error instanceof SourceError);
  assertEquals(deps.calls.length, 0);
});

Deno.test('the picker offers every repository the account can read', async () => {
  const deps = stubSource([
    matching(/\/user\/repos/, await loadFixture('github', 'repos_page_one')),
  ]);

  const options = await githubDriver.listScopeOptions(creds(), deps);

  assertEquals(options.map((option) => option.id), [BRAIN, 'supabase/supabase', ARCHIVE]);
  assertEquals(options[0].name, BRAIN);
  // A short page is the last page, so the walk stops rather than asking for an empty one.
  assertEquals(deps.calls.length, 1);
});

Deno.test('every request names the api version and a user agent', async () => {
  const deps = stubSource(await walkRoutes());

  await githubDriver.listChanges(creds(), deps, { cursor: null });

  for (const call of deps.calls) {
    // GitHub answers 403 to a request with no user agent, whatever the token says.
    assertEquals(call.headers['user-agent'], 'magpi');
    assertEquals(call.headers['x-github-api-version'], '2022-11-28');
    assertEquals(call.headers.authorization, `Bearer ${TOKEN}`);
  }
});

Deno.test('a refused credential asks for a reconnect', async () => {
  const deps = stubSource([
    { when: () => true, status: 401, body: await loadFixture('github', 'error_unauthorized') },
  ]);

  const error = await githubDriver
    .listChanges(creds(), deps, { cursor: null })
    .then(() => null, (thrown) => thrown);

  assert(error instanceof SourceError);
  assertEquals(error.needsReconnect, true);
});

Deno.test('a token that cannot be renewed says so rather than pretending', async () => {
  const outcome = await githubDriver.refresh(stubSource([]), {
    refreshToken: 'nothing',
    clientId: 'id',
    clientSecret: 'secret',
    tokenUrl: 'https://github.com/login/oauth/access_token',
  });

  assertEquals(outcome.kind, 'not_supported');
});
