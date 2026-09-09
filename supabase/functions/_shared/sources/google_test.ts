import { assert, assertEquals, assertRejects } from '@std/assert';

import type { SourceCredentials } from './contract.ts';
import { SourceError } from './contract.ts';
import { asRecord, asString } from './common.ts';
import { googleDriver } from './google.ts';
import { loadFixture, type StubCall, stubSource } from './testing/http_stub.ts';

const TOKEN = 'ya29.stub-access-token';
const HANDBOOK = '0AJhandbookFolderUk9PVA';
const RUNBOOK_ID = '1Qk7vNhandbookOnboard2fXpLa';
const ROTATION_ID = '1Bt3mRoncallRotation7dYqCe';
const REVIEW_ID = '1Zr4jVsecurityReviewPdf9Ct';

function creds(ids: string[] = []): SourceCredentials {
  return { accessToken: TOKEN, scopeSelection: { ids } };
}

function matching(fragment: string): (call: StubCall) => boolean {
  return (call) => call.url.includes(fragment);
}

/** The `text` field of a recorded body, for the two calls that answer a file. */
async function fixtureText(name: string): Promise<string> {
  return asString(asRecord(await loadFixture('google', name)).text);
}

Deno.test('a first pass records where to resume and reports no documents', async () => {
  const stub = stubSource([{
    when: matching('/changes/startPageToken'),
    body: await loadFixture('google', 'start_page_token'),
  }]);

  const page = await googleDriver.listChanges(creds(), stub, { cursor: null });

  assertEquals(page.documents, []);
  assertEquals(page.cursor, '18420');
  assertEquals(page.hasMore, false);
  assertEquals(stub.calls.length, 1);
  assertEquals(stub.calls[0].headers.authorization, `Bearer ${TOKEN}`);
});

Deno.test('an incremental pass reports the files the changes touched', async () => {
  const stub = stubSource([{
    when: matching('/changes?pageToken=18420'),
    body: await loadFixture('google', 'changes_recent'),
  }]);

  const page = await googleDriver.listChanges(creds(), stub, { cursor: '18420' });

  assertEquals(page.documents.length, 2);
  assertEquals(page.documents[0].externalId, RUNBOOK_ID);
  assertEquals(page.documents[0].title, 'Onboarding runbook');
  assertEquals(page.documents[0].updatedAt, '2026-09-08T09:13:58.117Z');
  assert(page.documents[0].url?.includes(RUNBOOK_ID));
  assertEquals(page.documents[1].mimeType, 'text/csv');
  assertEquals(page.cursor, '18455');
  assertEquals(page.hasMore, false);
});

Deno.test('deletions, trashed files and folders are not documents', async () => {
  const stub = stubSource([{
    when: matching('/changes?pageToken='),
    body: await loadFixture('google', 'changes_noise'),
  }]);

  const page = await googleDriver.listChanges(creds(), stub, { cursor: '18455' });

  assertEquals(page.documents.map((doc) => doc.externalId), [RUNBOOK_ID]);
  assertEquals(page.cursor, '18461');
});

Deno.test('a folder selection keeps only files parented in it', async () => {
  const stub = stubSource([{
    when: matching('/changes?pageToken='),
    body: await loadFixture('google', 'changes_across_folders'),
  }]);

  const page = await googleDriver.listChanges(creds([HANDBOOK]), stub, { cursor: '18461' });

  // The rotation sheet lives in two folders, one of them selected, so it stays.
  assertEquals(page.documents.map((doc) => doc.externalId), [RUNBOOK_ID, ROTATION_ID]);
});

Deno.test('a walk over several pages ends on the new start page token', async () => {
  const stub = stubSource([
    {
      when: matching('/changes?pageToken=18470'),
      body: await loadFixture('google', 'changes_page_one'),
    },
    {
      when: matching('/changes?pageToken=18471'),
      body: await loadFixture('google', 'changes_page_two'),
    },
  ]);

  const page = await googleDriver.listChanges(creds(), stub, { cursor: '18470' });

  assertEquals(stub.calls.length, 2);
  assertEquals(page.documents.map((doc) => doc.externalId), [RUNBOOK_ID, ROTATION_ID]);
  assertEquals(page.cursor, '18499');
  assertEquals(page.hasMore, false);
});

Deno.test('a backlog longer than the page bound stops and asks for another pass', async () => {
  const stub = stubSource([{
    when: matching('/changes?pageToken='),
    body: await loadFixture('google', 'changes_never_ending'),
  }]);

  const page = await googleDriver.listChanges(creds(), stub, { cursor: '18470' });

  assertEquals(stub.calls.length, 10);
  assertEquals(page.documents.length, 10);
  assertEquals(page.cursor, '18500');
  assertEquals(page.hasMore, true);
});

Deno.test('a google document is exported as plain text', async () => {
  const exported = await fixtureText('document_export_text');
  const stub = stubSource([
    {
      when: matching(`/files/${RUNBOOK_ID}?fields=`),
      body: await loadFixture('google', 'file_document'),
    },
    { when: matching(`/files/${RUNBOOK_ID}/export`), text: exported },
  ]);

  const doc = await googleDriver.fetchDocument(creds(), stub, RUNBOOK_ID);

  assertEquals(doc.mimeType, 'application/vnd.google-apps.document');
  assertEquals(doc.title, 'Onboarding runbook');
  assertEquals(doc.updatedAt, '2026-09-08T09:13:58.117Z');
  assertEquals(doc.text, exported);
  assert(stub.calls[1].url.includes('mimeType=text%2Fplain'));
  assertEquals(stub.calls[1].headers.authorization, `Bearer ${TOKEN}`);
});

Deno.test('a csv file is downloaded rather than exported', async () => {
  const downloaded = await fixtureText('spreadsheet_download_text');
  const stub = stubSource([
    {
      when: matching(`/files/${ROTATION_ID}?fields=`),
      body: await loadFixture('google', 'file_spreadsheet_csv'),
    },
    { when: matching(`/files/${ROTATION_ID}?alt=media`), text: downloaded },
  ]);

  const doc = await googleDriver.fetchDocument(creds(), stub, ROTATION_ID);

  assertEquals(doc.mimeType, 'text/csv');
  assertEquals(doc.text, downloaded);
  assert(doc.text.includes('week_starting'));
  assertEquals(stub.calls.length, 2);
});

Deno.test('a file type with no text extraction is refused without a reconnect', async () => {
  const stub = stubSource([{
    when: matching(`/files/${REVIEW_ID}?fields=`),
    body: await loadFixture('google', 'file_pdf'),
  }]);

  const error = await assertRejects(
    () => googleDriver.fetchDocument(creds(), stub, REVIEW_ID),
    SourceError,
    'That file type is not indexed yet.',
  );

  assertEquals(error.needsReconnect, false);
  assertEquals(error.provider, 'google_drive');
});

Deno.test('a refused export asks for a reconnect and quotes nothing back', async () => {
  const stub = stubSource([
    {
      when: matching(`/files/${RUNBOOK_ID}?fields=`),
      body: await loadFixture('google', 'file_document'),
    },
    {
      when: matching(`/files/${RUNBOOK_ID}/export`),
      status: 401,
      text: `{"error":{"message":"Invalid Credentials for Bearer ${TOKEN}"}}`,
    },
  ]);

  const error = await assertRejects(
    () => googleDriver.fetchDocument(creds(), stub, RUNBOOK_ID),
    SourceError,
  );

  assertEquals(error.needsReconnect, true);
  assert(!error.message.includes(TOKEN));
  assert(!error.message.includes('Invalid Credentials'));
});

Deno.test('the scope picker is offered every folder across pages', async () => {
  const stub = stubSource([
    {
      when: (call) => call.url.includes('/files?q=') && !call.url.includes('pageToken='),
      body: await loadFixture('google', 'folders_page_one'),
    },
    {
      when: (call) => call.url.includes('/files?q=') && call.url.includes('pageToken='),
      body: await loadFixture('google', 'folders_page_two'),
    },
  ]);

  const options = await googleDriver.listScopeOptions(creds(), stub);

  assertEquals(stub.calls.length, 2);
  assertEquals(options.map((option) => option.name), [
    'Team handbook',
    'Incident reports',
    'Finance',
    'Archive 2025',
  ]);
  assertEquals(options[0], { id: HANDBOOK, name: 'Team handbook' });
});

Deno.test('refresh delegates to the shared token endpoint grant', async () => {
  const stub = stubSource([{
    when: matching('oauth2.googleapis.com/token'),
    body: await loadFixture('google', 'token_refresh'),
  }]);

  const outcome = await googleDriver.refresh(stub, {
    refreshToken: '1//0gStoredRefreshToken',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  });

  assertEquals(outcome.kind, 'refreshed');
  if (outcome.kind !== 'refreshed') return;
  assertEquals(outcome.accessToken, 'ya29.a0AfB_refreshed_access_token_value');
  // Google does not rotate on every renewal, so the stored token stands.
  assertEquals(outcome.refreshToken, '1//0gStoredRefreshToken');
  assertEquals(outcome.expiresAt, '2026-09-09T12:59:59.000Z');
  assertEquals(stub.calls[0].method, 'POST');
});
