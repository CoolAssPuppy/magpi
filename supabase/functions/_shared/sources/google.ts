// Google Drive, read through the changes API.
//
// Drive is the odd one of the four. Its cursor is an opaque page token the API
// itself hands back rather than a timestamp we compare, and the text of a file
// is a second request whose shape depends on the file's mime type.

import type {
  ChangePage,
  FetchedDocument,
  RefreshInput,
  RefreshOutcome,
  ScopeOption,
  SourceCredentials,
  SourceDeps,
  SourceDocumentRef,
  SourceDriver,
} from './contract.ts';
import { SourceError } from './contract.ts';
import {
  asArray,
  asRecord,
  asString,
  isoStamp,
  refreshWithTokenEndpoint,
  requestJson,
  selectedIds,
} from './common.ts';

// Matches the slug seeded into `providers`. The registry row is the authority
// and sources_registry_test pins the two together.
const PROVIDER = 'google_drive';
const API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const PAGE_SIZE = 100;

/**
 * One pass runs inside a single function invocation with a wall clock budget,
 * so a connection with a long backlog is walked a slice at a time. The bound
 * stops the walk, `hasMore` asks the caller to schedule another pass, and the
 * cursor handed back resumes exactly where this one stopped.
 */
const MAX_PAGES = 10;

const RECONNECT_MESSAGE = 'google drive refused this connection, reconnect it';
const FAILURE_MESSAGE = 'google drive could not be read, the next sync will try again';

const CHANGE_FIELDS = 'nextPageToken,newStartPageToken,changes(fileId,removed,' +
  'file(id,name,mimeType,modifiedTime,webViewLink,trashed,parents))';

const FOLDER_QUERY = "q=mimeType%3D'application%2Fvnd.google-apps.folder'%20and%20trashed%3Dfalse" +
  `&pageSize=${PAGE_SIZE}&fields=nextPageToken,files(id,name)`;

/** A native Drive file holds no bytes to download; each one exports as one text type. */
const EXPORT_TYPES = new Map<string, string>([
  ['application/vnd.google-apps.document', 'text/plain'],
  ['application/vnd.google-apps.spreadsheet', 'text/csv'],
  ['application/vnd.google-apps.presentation', 'text/plain'],
]);

function authHeader(creds: SourceCredentials): Record<string, string> {
  return { authorization: `Bearer ${creds.accessToken}` };
}

function getJson(creds: SourceCredentials, deps: SourceDeps, url: string): Promise<unknown> {
  return requestJson(PROVIDER, deps, url, {
    headers: authHeader(creds),
    reconnectMessage: RECONNECT_MESSAGE,
    failureMessage: FAILURE_MESSAGE,
  });
}

/**
 * A text body, classified by the same rule requestJson uses on a JSON one.
 *
 * An export and an `alt=media` download answer with the file itself, so the
 * shared JSON path cannot read them. Only the status rule is repeated here, and
 * nothing the provider returned reaches the message: an error body can quote the
 * request back, and the request carries the token.
 */
async function requestText(
  creds: SourceCredentials,
  deps: SourceDeps,
  url: string,
): Promise<string> {
  let response: Response;
  try {
    response = await deps.fetch(url, { headers: authHeader(creds) });
  } catch {
    throw new SourceError(PROVIDER, FAILURE_MESSAGE);
  }

  if (response.status === 401 || response.status === 403) {
    throw new SourceError(PROVIDER, RECONNECT_MESSAGE, true);
  }
  if (!response.ok) {
    throw new SourceError(PROVIDER, FAILURE_MESSAGE);
  }
  return await response.text();
}

/**
 * One change as a document reference, or null when this sync has no use for it.
 *
 * A change with no `file` body is one the connection can no longer read, which
 * reads the same as a deletion from here.
 */
function changeToRef(
  change: unknown,
  keep: Set<string>,
  deps: SourceDeps,
): SourceDocumentRef | null {
  const record = asRecord(change);
  if (record.removed === true) return null;

  const file = asRecord(record.file);
  const externalId = asString(file.id);
  if (externalId.length === 0 || file.trashed === true) return null;

  const mimeType = asString(file.mimeType);
  if (mimeType === FOLDER_MIME) return null;

  if (keep.size > 0 && !asArray(file.parents).some((id) => keep.has(asString(id)))) return null;

  return {
    externalId,
    title: asString(file.name, 'Untitled'),
    url: asString(file.webViewLink) || null,
    mimeType: mimeType || null,
    updatedAt: isoStamp(file.modifiedTime, deps),
  };
}

/**
 * A first pass reports no documents.
 *
 * Drive will only hand out changes made after a token it issued, so there is no
 * token that means "from the beginning". The first pass asks for today's token
 * and stores it, and the pass after that is the one that reports anything.
 */
async function startCursor(creds: SourceCredentials, deps: SourceDeps): Promise<ChangePage> {
  const payload = asRecord(await getJson(creds, deps, `${API}/changes/startPageToken`));
  return { documents: [], cursor: asString(payload.startPageToken) || null, hasMore: false };
}

function changesUrl(pageToken: string): string {
  return `${API}/changes?pageToken=${encodeURIComponent(pageToken)}` +
    `&pageSize=${PAGE_SIZE}&fields=${CHANGE_FIELDS}`;
}

async function walkChanges(
  creds: SourceCredentials,
  deps: SourceDeps,
  from: string,
): Promise<ChangePage> {
  const keep = selectedIds(creds.scopeSelection.ids);
  const documents: SourceDocumentRef[] = [];
  let cursor = from;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = asRecord(await getJson(creds, deps, changesUrl(cursor)));
    for (const change of asArray(payload.changes)) {
      const ref = changeToRef(change, keep, deps);
      if (ref) documents.push(ref);
    }

    const next = asString(payload.nextPageToken);
    if (next.length === 0) {
      return { documents, cursor: asString(payload.newStartPageToken) || cursor, hasMore: false };
    }
    cursor = next;
  }

  return { documents, cursor, hasMore: true };
}

function textUrl(externalId: string, mimeType: string): string {
  const id = encodeURIComponent(externalId);
  const exportType = EXPORT_TYPES.get(mimeType);
  if (exportType !== undefined) {
    return `${API}/files/${id}/export?mimeType=${encodeURIComponent(exportType)}`;
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return `${API}/files/${id}?alt=media`;
  }
  // Known gap: a PDF, an image or a binary office file needs the extraction that
  // today only the upload path runs. Wiring Drive into it is follow-up work
  // (prashant), so until then the sync says what happened instead of storing bytes.
  throw new SourceError(PROVIDER, 'that file type is not indexed yet');
}

async function walkFolders(creds: SourceCredentials, deps: SourceDeps): Promise<ScopeOption[]> {
  const options: ScopeOption[] = [];
  let pageToken = '';

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const suffix = pageToken.length > 0 ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const payload = asRecord(await getJson(creds, deps, `${API}/files?${FOLDER_QUERY}${suffix}`));

    for (const entry of asArray(payload.files)) {
      const folder = asRecord(entry);
      const id = asString(folder.id);
      if (id.length === 0) continue;
      options.push({ id, name: asString(folder.name, 'Untitled folder'), kind: 'folder' });
    }

    pageToken = asString(payload.nextPageToken);
    if (pageToken.length === 0) break;
  }

  return options;
}

export const googleDriver: SourceDriver = {
  provider: PROVIDER,
  scopeSelectionKind: 'folder',

  listChanges(
    creds: SourceCredentials,
    deps: SourceDeps,
    input: { cursor: string | null },
  ): Promise<ChangePage> {
    if (!input.cursor) return startCursor(creds, deps);
    return walkChanges(creds, deps, input.cursor);
  },

  async fetchDocument(
    creds: SourceCredentials,
    deps: SourceDeps,
    externalId: string,
  ): Promise<FetchedDocument> {
    const fields = 'id,name,mimeType,modifiedTime,webViewLink';
    const file = asRecord(
      await getJson(creds, deps, `${API}/files/${encodeURIComponent(externalId)}?fields=${fields}`),
    );
    const mimeType = asString(file.mimeType);

    return {
      externalId,
      title: asString(file.name, 'Untitled'),
      url: asString(file.webViewLink) || null,
      mimeType,
      updatedAt: isoStamp(file.modifiedTime, deps),
      text: await requestText(creds, deps, textUrl(externalId, mimeType)),
    };
  },

  listScopeOptions(creds: SourceCredentials, deps: SourceDeps): Promise<ScopeOption[]> {
    return walkFolders(creds, deps);
  },

  refresh(deps: SourceDeps, input: RefreshInput): Promise<RefreshOutcome> {
    return refreshWithTokenEndpoint(PROVIDER, deps, input);
  },
};
