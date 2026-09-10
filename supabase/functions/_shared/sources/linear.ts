// Linear, read over its single GraphQL endpoint.

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

// A pass reads at most this many pages, then resumes on the next pass.
const MAX_REQUESTS = 5;

/** An error code naming the credential rather than the request. */
const CREDENTIAL_CODE = /auth|forbidden|permission/i;

const RECONNECT_MESSAGE = `${DISPLAY_NAME} refused this connection, reconnect it.`;
const FAILURE_MESSAGE = `${DISPLAY_NAME} could not be read, the next sync will try again.`;

// `orderBy` names a field, not a direction, so coverage means walking to the last page.
const CHANGES_QUERY = `query MagpiChanges($first: Int!, $after: String, $filter: IssueFilter) {
  issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt) {
    nodes { id identifier title url updatedAt team { id } }
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
    team { id }
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

/** A personal api key is the whole header value, an oauth token needs a Bearer prefix. */
function authorization(accessToken: string): string {
  return accessToken.startsWith(API_KEY_PREFIX) ? accessToken : `Bearer ${accessToken}`;
}

/** Raises on GraphQL errors in the body, whatever the status was. Reads the codes only. */
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

/** The issue filter, or null: an updatedAt clause of `gt: null` would match everything. */
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
    // The identifier rides along so a citation reads as ENG-214.
    title: [identifier, title].filter((part) => part.length > 0).join(' '),
    url: asString(node.url) || null,
    mimeType: 'text/markdown',
    updatedAt: isoStamp(node.updatedAt, deps),
    // An issue belongs to one team, and a team is what the scope picker offers.
    unitId: asString(asRecord(node.team).id),
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
        // An issue with no team named has no unit, so nothing routes it to a space.
        if (document.externalId.length > 0 && document.unitId.length > 0) documents.push(document);
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

    // A pass that ran out of requests resumes at its last page, not at the newest stamp.
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
      // A deleted or moved issue is normal mid-sync, not a reason to reconnect.
      throw new SourceError(PROVIDER, 'That Linear issue is no longer available.', false);
    }

    const ref = toDocumentRef(issue, deps);
    if (ref.unitId.length === 0) {
      throw new SourceError(PROVIDER, 'That Linear issue names no team to file it under.', false);
    }

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
      }));
  },

  refresh(deps: SourceDeps, input: RefreshInput): Promise<RefreshOutcome> {
    return refreshWithTokenEndpoint(PROVIDER, DISPLAY_NAME, deps, input);
  },
};
