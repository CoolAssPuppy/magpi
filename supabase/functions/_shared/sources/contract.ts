// What a source driver promises, and nothing more.
//
// Four providers answer four different APIs. The contract is what ingest,
// sync and the scope picker are written against, so adding a fifth provider is
// one file plus a registry row, and none of the callers change.

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
  /**
   * Where the next incremental pass resumes. Each provider spells this
   * differently: Notion a last_edited_time, Linear an updatedAt, Slack a channel
   * timestamp, Drive an opaque page token. The column stores whatever the driver
   * hands back and nothing else reads it.
   */
  cursor: string | null;
  hasMore: boolean;
}

export interface FetchedDocument extends SourceDocumentRef {
  mimeType: string;
  text: string;
}

export interface ScopeOption {
  id: string;
  name: string;
  kind: ScopeSelectionKind;
}

export interface RefreshInput {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
}

/**
 * What a refresh attempt produced.
 *
 * A value rather than a thrown error, because the caller has to write the
 * outcome onto the connection either way: `failed` becomes status 'expired'
 * with a detail the user can read, and `not_supported` is a provider whose
 * tokens simply do not expire, which is not a problem to report.
 */
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
  readonly scopeSelectionKind: ScopeSelectionKind | null;

  /**
   * Documents changed since `cursor`, newest state first, plus where to resume.
   *
   * A null cursor means a first pass. A driver decides how far back that reaches;
   * none of them walk the whole history in one call.
   */
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

/**
 * Raised by a driver when the provider refused it.
 *
 * The message reaches connections.status_detail, which a user reads, so it says
 * what they can do about it rather than what the HTTP status was. It never
 * carries anything the provider sent back, because a provider's error body can
 * quote the request, and the request carries the token.
 */
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
