// Google Drive, read through the changes API. Its cursor is an opaque page token Drive issues.

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

// Matches the slug seeded into `providers`, which sources_registry_test pins to this constant.
const PROVIDER = 'google_drive';
const DISPLAY_NAME = 'Google Drive';
const API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const PAGE_SIZE = 100;

/** Pages per pass. Past this the walk stops, sets hasMore, and returns a cursor to resume from. */
const MAX_PAGES = 10;

const RECONNECT_MESSAGE = `${DISPLAY_NAME} refused this connection, reconnect it.`;
const FAILURE_MESSAGE = `${DISPLAY_NAME} could not be read, the next sync will try again.`;

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

/** Reads a text body by requestJson's status rule. No provider text reaches the error message. */
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

/** The picked folder a file sits in, or null when none of its parents was picked. */
function pickedFolderOf(parents: unknown, keep: Set<string>): string | null {
  for (const parent of asArray(parents)) {
    const id = asString(parent);
    if (keep.has(id)) return id;
  }
  return null;
}

/** One change as a document ref, or null. A change with no `file` body counts as a deletion. */
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

  // A file outside every picked folder has no space to land in.
  const unitId = pickedFolderOf(file.parents, keep);
  if (unitId === null) return null;

  return {
    externalId,
    title: asString(file.name, 'Untitled'),
    url: asString(file.webViewLink) || null,
    mimeType: mimeType || null,
    updatedAt: isoStamp(file.modifiedTime, deps),
    unitId,
  };
}

/** Stores today's page token and reports nothing. Drive has no token meaning "from the start". */
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
  // Known gap: PDFs, images and binary office files need the extraction only the upload path runs.
  throw new SourceError(PROVIDER, 'That file type is not indexed yet.');
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
      options.push({ id, name: asString(folder.name, 'Untitled folder') });
    }

    pageToken = asString(payload.nextPageToken);
    if (pageToken.length === 0) break;
  }

  return options;
}

export const googleDriver: SourceDriver = {
  provider: PROVIDER,
  displayName: DISPLAY_NAME,
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
    const fields = 'id,name,mimeType,modifiedTime,webViewLink,parents';
    const file = asRecord(
      await getJson(creds, deps, `${API}/files/${encodeURIComponent(externalId)}?fields=${fields}`),
    );
    const mimeType = asString(file.mimeType);

    const unitId = pickedFolderOf(file.parents, selectedIds(creds.scopeSelection.ids));
    if (unitId === null) {
      throw new SourceError(PROVIDER, 'That file sits outside every folder this connection reads.');
    }

    return {
      externalId,
      title: asString(file.name, 'Untitled'),
      url: asString(file.webViewLink) || null,
      mimeType,
      updatedAt: isoStamp(file.modifiedTime, deps),
      unitId,
      text: await requestText(creds, deps, textUrl(externalId, mimeType)),
    };
  },

  listScopeOptions(creds: SourceCredentials, deps: SourceDeps): Promise<ScopeOption[]> {
    return walkFolders(creds, deps);
  },

  refresh(deps: SourceDeps, input: RefreshInput): Promise<RefreshOutcome> {
    return refreshWithTokenEndpoint(PROVIDER, DISPLAY_NAME, deps, input);
  },
};
