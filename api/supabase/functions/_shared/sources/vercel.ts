// Vercel deployments, collapsed to one row per project.
//
// The deploys page answers "is anything red right now", so a project that
// deployed six times in a row should take one line, not six.

import type { Deployment, DeploymentState, FetchDeps, ProviderCredentials } from "./contract.ts";
import { asArray, asNumber, asRecord, asString, firstLine, requestJson } from "./common.ts";

const PROVIDER = "vercel";
const ENDPOINT = "https://api.vercel.com/v6/deployments";

const RECONNECT = "reconnect vercel on the connections page";
const UNAVAILABLE = "vercel is not answering, this page will retry";

/**
 * How many upstream rows to ask for per row shown.
 *
 * The upstream list is per deployment and the page is per project, so asking
 * for exactly the number wanted returns fewer projects than that whenever one
 * project is deploying repeatedly.
 */
const PROJECT_OVERSAMPLE = 4;

const DEPLOY_STATES: readonly DeploymentState[] = [
  "READY",
  "BUILDING",
  "ERROR",
  "QUEUED",
  "CANCELED",
];

/** Anything the badge has no colour for waits its turn as QUEUED. */
function deploymentState(raw: unknown): DeploymentState {
  const value = asString(raw).toUpperCase();
  return DEPLOY_STATES.find((state) => state === value) ?? "QUEUED";
}

const COMMIT_FIELDS = [
  "githubCommitMessage",
  "gitlabCommitMessage",
  "bitbucketCommitMessage",
] as const;

function commitMessage(meta: Record<string, unknown>): string | null {
  for (const field of COMMIT_FIELDS) {
    const line = firstLine(meta[field]);
    if (line) return line;
  }
  return null;
}

export interface DeploymentsOptions {
  teamId: string | null;
  limit: number;
}

export async function deployments(
  creds: ProviderCredentials,
  deps: FetchDeps,
  options: DeploymentsOptions,
): Promise<Deployment[]> {
  const limit = Math.max(0, Math.floor(options.limit));
  if (limit === 0) return [];

  const url = new URL(ENDPOINT);
  url.searchParams.set("limit", String(limit * PROJECT_OVERSAMPLE));
  if (options.teamId) url.searchParams.set("teamId", options.teamId);

  const body = asRecord(
    await requestJson(PROVIDER, deps, url.toString(), {
      headers: { authorization: `Bearer ${creds.accessToken}` },
      reconnectMessage: RECONNECT,
      failureMessage: UNAVAILABLE,
    }),
  );

  const nowMs = deps.now.getTime();
  const newestByProject = new Map<string, { created: number; row: Deployment }>();

  for (const raw of asArray(body.deployments)) {
    const item = asRecord(raw);
    const name = firstLine(item.name);
    // A deployment with no project name has nothing to render as a label.
    if (!name) continue;

    const created = asNumber(item.created, asNumber(item.createdAt));
    const existing = newestByProject.get(name);
    if (existing && existing.created >= created) continue;

    newestByProject.set(name, {
      created,
      row: {
        name,
        state: deploymentState(item.state),
        commit: commitMessage(asRecord(item.meta)),
        ageMs: Math.max(0, nowMs - created),
      },
    });
  }

  return [...newestByProject.values()]
    .sort((left, right) => right.created - left.created)
    .slice(0, limit)
    .map((entry) => entry.row);
}
