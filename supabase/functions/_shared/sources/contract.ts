// What a source driver promises: the interface ingest, sync and the picker are written against.

import type { ClockDeps, HttpDeps } from '../deps.ts';
import type { ScopeSelectionKind } from '../providers.ts';

export interface SourceDeps extends HttpDeps, ClockDeps {}

/** Which channels, folders or workspaces a connection reads. */
export interface ScopeSelection {
  ids: string[];
}

/** Credentials a driver is handed. The caller decrypts; a driver never does. */
export interface SourceCredentials {
  accessToken: string;
  scopeSelection: ScopeSelection;
}

export interface SourceDocumentRef {
  externalId: string;
  title: string;
  url: string | null;
  mimeType: string | null;
  /** The provider's own last-modified stamp, as RFC 3339. */
  updatedAt: string;
}

export interface ChangePage {
  documents: SourceDocumentRef[];
  /** Where the next incremental pass resumes. Each provider spells this differently. */
  cursor: string | null;
  /** True when the driver stopped on its own request cap rather than at the end of the changes. */
  hasMore: boolean;
}

export interface FetchedDocument extends SourceDocumentRef {
  mimeType: string;
  text: string;
}

/** One thing the picker can offer. What kind of thing is named on `scopeSelectionKind`. */
export interface ScopeOption {
  id: string;
  name: string;
}

export interface RefreshInput {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
}

/** What a refresh attempt produced, as a value the caller writes onto the connection. */
export type RefreshOutcome =
  | {
    kind: 'refreshed';
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string | null;
  }
  | { kind: 'not_supported' }
  | { kind: 'failed'; detail: string };

export interface SourceDriver {
  readonly provider: string;
  /** What a person calls this source, as opposed to the slug. Reaches status_detail. */
  readonly displayName: string;
  readonly scopeSelectionKind: ScopeSelectionKind | null;

  /** Documents changed since `cursor`, newest state first, plus where to resume. */
  listChanges(
    creds: SourceCredentials,
    deps: SourceDeps,
    input: { cursor: string | null },
  ): Promise<ChangePage>;

  /** The text of one document, ready to chunk. */
  fetchDocument(
    creds: SourceCredentials,
    deps: SourceDeps,
    externalId: string,
  ): Promise<FetchedDocument>;

  /** What the scope picker offers after the redirect. Empty when there is nothing to pick. */
  listScopeOptions(creds: SourceCredentials, deps: SourceDeps): Promise<ScopeOption[]>;

  /** Trades a refresh token for a live access token, or says why it could not. */
  refresh(deps: SourceDeps, input: RefreshInput): Promise<RefreshOutcome>;
}

/** Raised by a driver when the provider refused it. The message reaches status_detail. */
export class SourceError extends Error {
  readonly provider: string;
  /** True when reconnecting is the fix, which the connections page shows. */
  readonly needsReconnect: boolean;

  constructor(provider: string, message: string, needsReconnect = false) {
    super(message);
    this.name = 'SourceError';
    this.provider = provider;
    this.needsReconnect = needsReconnect;
  }
}
