// Linear, read over its single GraphQL endpoint.
//
// Two habits of Linear's shape this file. It answers HTTP 200 with a top-level
// `errors` array when it refuses, so the status alone never says whether a call
// worked. And it takes a personal api key raw on the authorization header while
// an oauth token wants a Bearer prefix, with the key's own prefix the only way
// to tell the two apart.

import {
  type ChangePage,
  type FetchedDocument,
  type RefreshInput,
  type RefreshOutcome,
  type ScopeOption,
  type SourceCredentials,
  type SourceDeps,
  type SourceDocumentRef,
  type SourceDriver,
  SourceError,
} from './contract.ts';
import {
  asArray,
  asRecord,
  asString,
  isoStamp,
  parseInstant,
  refreshWithTokenEndpoint,
  requestJson,
} from './common.ts';

const PROVIDER = 'linear';
const DISPLAY_NAME = 'Linear';
const ENDPOINT = 'https://api.linear.app/graphql';
const PAGE_SIZE = 50;
const TEAM_PAGE_SIZE = 100;
const API_KEY_PREFIX = 'lin_api_';

/** An error code naming the credential rather than the request. */
const CREDENTIAL_CODE = /auth|forbidden|permission/i;

const RECONNECT_MESSAGE = `${DISPLAY_NAME} refused this connection, reconnect it.`;
const FAILURE_MESSAGE = `${DISPLAY_NAME} could not be read, the next sync will try again.`;

const CHANGES_QUERY = `query MagpiChanges($first: Int!, $filter: IssueFilter) {
  issues(first: $first, filter: $filter, orderBy: updatedAt) {
    nodes { id identifier title url updatedAt }
    pageInfo { hasNextPage endCursor }
  }
}`;

const ISSUE_QUERY = `query MagpiIssue($id: String!, $comments: Int!) {
  issue(id: $id) {
    id
    identifier
    title
    url
    updatedAt
    description
    comments(first: $comments) {
      nodes { body createdAt user { name } }
    }
  }
}`;

const TEAMS_QUERY = `query MagpiTeams($first: Int!) {
  teams(first: $first) {
    nodes { id name }
  }
}`;

/**
 * Linear reads a personal api key as the whole header value and an oauth token
 * as a bearer credential. Sending either one the other way is a 400.
 */
function authorization(accessToken: string): string {
  return accessToken.startsWith(API_KEY_PREFIX) ? accessToken : `Bearer ${accessToken}`;
}

/**
 * Raises when the body carries GraphQL errors, whatever the status was.
 *
 * Only the codes are read. Linear's own error text can quote the request that
 * produced it, and the request carries the token.
 */
function raiseOnGraphqlErrors(body: Record<string, unknown>): void {
  const errors = asArray(body.errors);
  if (errors.length === 0) return;

  const needsReconnect = errors.some((entry) => {
    const extensions = asRecord(asRecord(entry).extensions);
    return CREDENTIAL_CODE.test(asString(extensions.code));
  });
  throw new SourceError(
    PROVIDER,
    needsReconnect ? RECONNECT_MESSAGE : FAILURE_MESSAGE,
    needsReconnect,
  );
}

/** One GraphQL round trip, answering the `data` object. */
async function query(
  deps: SourceDeps,
  accessToken: string,
  document: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const payload = await requestJson(PROVIDER, deps, ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: authorization(accessToken),
    },
    body: JSON.stringify({ query: document, variables }),
    reconnectMessage: RECONNECT_MESSAGE,
    failureMessage: FAILURE_MESSAGE,
  });

  const body = asRecord(payload);
  raiseOnGraphqlErrors(body);
  return asRecord(body.data);
}

/**
 * The issue filter, or null when there is nothing to narrow by.
 *
 * A first pass sends no updatedAt clause at all, because `gt: null` would ask
 * Linear to compare against nothing and it answers with everything.
 */
function changeFilter(cursor: string | null, teamIds: string[]): Record<string, unknown> | null {
  const filter: Record<string, unknown> = {};
  if (cursor) filter.updatedAt = { gt: cursor };
  if (teamIds.length > 0) filter.team = { id: { in: teamIds } };
  return Object.keys(filter).length > 0 ? filter : null;
}

function toDocumentRef(node: Record<string, unknown>, deps: SourceDeps): SourceDocumentRef {
  const identifier = asString(node.identifier);
  const title = asString(node.title);
  return {
    externalId: asString(node.id),
    // The identifier rides along so a citation reads as ENG-214 rather than as
    // a title that could belong to any of four teams.
    title: [identifier, title].filter((part) => part.length > 0).join(' '),
    url: asString(node.url) || null,
    mimeType: 'text/markdown',
    updatedAt: isoStamp(node.updatedAt, deps),
  };
}

/**
 * The newest stamp in the page, or the cursor we came in with.
 *
 * Holding the old cursor when a page is empty keeps a quiet connection from
 * rewinding to the beginning of time on its next pass.
 */
function newestUpdatedAt(documents: SourceDocumentRef[], fallback: string | null): string | null {
  let newest = fallback;
  let newestMs = parseInstant(fallback) ?? Number.NEGATIVE_INFINITY;

  for (const document of documents) {
    const ms = parseInstant(document.updatedAt);
    if (ms !== null && ms > newestMs) {
      newestMs = ms;
      newest = document.updatedAt;
    }
  }
  return newest;
}

/** Description first, then one block per comment, each named. */
function issueText(issue: Record<string, unknown>): string {
  const blocks: string[] = [];

  const description = asString(issue.description).trim();
  if (description.length > 0) blocks.push(description);

  for (const entry of asArray(asRecord(issue.comments).nodes)) {
    const comment = asRecord(entry);
    const body = asString(comment.body).trim();
    if (body.length === 0) continue;
    const author = asString(asRecord(comment.user).name, 'Unknown');
    blocks.push(`${author}: ${body}`);
  }

  return blocks.join('\n\n');
}

export const linearDriver: SourceDriver = {
  provider: PROVIDER,
  displayName: DISPLAY_NAME,
  scopeSelectionKind: 'workspace',

  async listChanges(
    creds: SourceCredentials,
    deps: SourceDeps,
    input: { cursor: string | null },
  ): Promise<ChangePage> {
    const data = await query(deps, creds.accessToken, CHANGES_QUERY, {
      first: PAGE_SIZE,
      filter: changeFilter(input.cursor, creds.scopeSelection.ids),
    });

    const issues = asRecord(data.issues);
    const documents = asArray(issues.nodes)
      .map((node) => toDocumentRef(asRecord(node), deps))
      .filter((document) => document.externalId.length > 0);

    return {
      documents,
      cursor: newestUpdatedAt(documents, input.cursor),
      hasMore: asRecord(issues.pageInfo).hasNextPage === true,
    };
  },

  async fetchDocument(
    creds: SourceCredentials,
    deps: SourceDeps,
    externalId: string,
  ): Promise<FetchedDocument> {
    const data = await query(deps, creds.accessToken, ISSUE_QUERY, {
      id: externalId,
      comments: PAGE_SIZE,
    });

    const issue = asRecord(data.issue);
    if (asString(issue.id).length === 0) {
      // A deleted or moved issue is a normal thing to meet mid-sync, and asking
      // the user to reconnect over it would be wrong.
      throw new SourceError(PROVIDER, 'That Linear issue is no longer available.', false);
    }

    const ref = toDocumentRef(issue, deps);
    return { ...ref, mimeType: 'text/markdown', text: issueText(issue) };
  },

  async listScopeOptions(creds: SourceCredentials, deps: SourceDeps): Promise<ScopeOption[]> {
    const data = await query(deps, creds.accessToken, TEAMS_QUERY, { first: TEAM_PAGE_SIZE });

    return asArray(asRecord(data.teams).nodes)
      .map((node) => asRecord(node))
      .filter((team) => asString(team.id).length > 0)
      .map((team) => ({
        id: asString(team.id),
        name: asString(team.name, asString(team.id)),
        kind: 'workspace' as const,
      }));
  },

  refresh(deps: SourceDeps, input: RefreshInput): Promise<RefreshOutcome> {
    return refreshWithTokenEndpoint(DISPLAY_NAME, deps, input);
  },
};
