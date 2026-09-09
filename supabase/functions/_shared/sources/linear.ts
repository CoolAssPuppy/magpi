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
  refreshWithTokenEndpoint,
  requestJson,
} from './common.ts';
import { encodeBacklog, newestStamp, parseCursor } from './cursor.ts';

const PROVIDER = 'linear';
const DISPLAY_NAME = 'Linear';
const ENDPOINT = 'https://api.linear.app/graphql';
const PAGE_SIZE = 50;
const TEAM_PAGE_SIZE = 100;
const API_KEY_PREFIX = 'lin_api_';

// A pass reads at most this many pages. A workspace with more changes than that
// finishes over the passes that follow, one page token at a time.
const MAX_REQUESTS = 5;

/** An error code naming the credential rather than the request. */
const CREDENTIAL_CODE = /auth|forbidden|permission/i;

const RECONNECT_MESSAGE = `${DISPLAY_NAME} refused this connection, reconnect it.`;
const FAILURE_MESSAGE = `${DISPLAY_NAME} could not be read, the next sync will try again.`;

// `orderBy` names the field and not a direction, and Linear is free to answer
// either way, so coverage comes from walking `after: endCursor` to the end
// rather than from trusting the first page to hold the oldest changes.
const CHANGES_QUERY = `query MagpiChanges($first: Int!, $after: String, $filter: IssueFilter) {
  issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt) {
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
    const position = parseCursor(input.cursor);
    const filter = changeFilter(position.since, creds.scopeSelection.ids);
    const documents: SourceDocumentRef[] = [];

    let after = position.kind === 'backlog' ? position.page : null;
    let nextPage: string | null = null;

    for (let request = 0; request < MAX_REQUESTS; request++) {
      const data = await query(deps, creds.accessToken, CHANGES_QUERY, {
        first: PAGE_SIZE,
        after,
        filter,
      });

      const issues = asRecord(data.issues);
      for (const node of asArray(issues.nodes)) {
        const document = toDocumentRef(asRecord(node), deps);
        if (document.externalId.length > 0) documents.push(document);
      }

      const pageInfo = asRecord(issues.pageInfo);
      const endCursor = asString(pageInfo.endCursor);
      nextPage = pageInfo.hasNextPage === true && endCursor.length > 0 ? endCursor : null;
      if (nextPage === null) break;
      after = nextPage;
    }

    const watermark = newestStamp(
      documents,
      position.kind === 'backlog' ? position.watermark : position.since,
    );

    // A pass that ran out of requests resumes at the page it stopped on. The
    // newest stamp it saw is not where to resume: with no direction pinned on
    // the query, the pages it has not read can hold anything.
    if (nextPage !== null) {
      return {
        documents,
        cursor: encodeBacklog({ page: nextPage, watermark, since: position.since }),
        hasMore: true,
      };
    }

    return { documents, cursor: watermark, hasMore: false };
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
