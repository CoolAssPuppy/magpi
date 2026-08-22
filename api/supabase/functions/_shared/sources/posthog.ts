// One PostHog insight, read as a single number with a sparkline behind it.
//
// The host is per connection, so a self-hosted and a cloud wearer share this
// file. It is validated before it reaches a URL, because it arrives from the
// connection record rather than from here.

import { SPARK_POINTS } from "../badge-constants.ts";
import { SourceError } from "./contract.ts";
import type { FetchDeps, NumberReading, ProviderCredentials } from "./contract.ts";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  firstLine,
  parseInstant,
  relativeLabel,
  requestJson,
} from "./common.ts";

const PROVIDER = "posthog";

const RECONNECT = "reconnect posthog on the connections page";
const UNAVAILABLE = "posthog is not answering, this page will retry";
const UNCONFIGURED = "set the posthog host, project and insight on this connection";

const FALLBACK_LABEL = "posthog";

/** Origin only. A path, a query, or a bare hostname all reduce to the same thing. */
function normaliseHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return parsed.hostname.length > 0 ? `${parsed.protocol}//${parsed.host}` : null;
  } catch {
    return null;
  }
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function insight(creds: ProviderCredentials, deps: FetchDeps): Promise<NumberReading> {
  const host = normaliseHost(asString(creds.meta.host));
  const projectId = asString(creds.meta.project_id).trim();
  const insightId = asString(creds.meta.insight_id).trim();
  if (!host || projectId.length === 0 || insightId.length === 0) {
    throw new SourceError(PROVIDER, UNCONFIGURED);
  }

  const url =
    `${host}/api/projects/${encodeURIComponent(projectId)}` +
    `/insights/${encodeURIComponent(insightId)}/`;

  const body = asRecord(
    await requestJson(PROVIDER, deps, url, {
      headers: { authorization: `Bearer ${creds.accessToken}` },
      reconnectMessage: RECONNECT,
      failureMessage: UNAVAILABLE,
    }),
  );

  const series = asRecord(asArray(body.result)[0]);
  const points = asArray(series.data).map((point) => asNumber(point));
  const spark = points.slice(-SPARK_POINTS);

  const value = spark.length > 0 ? spark[spark.length - 1] : 0;
  const first = spark.length > 0 ? spark[0] : 0;

  const refreshed = parseInstant(body.last_refresh) ?? parseInstant(body.last_modified_at);

  return {
    label: firstLine(body.name) ?? firstLine(series.label) ?? FALLBACK_LABEL,
    value,
    // PostHog carries no unit on a trend series, so the page supplies one.
    unit: null,
    spark,
    // A window that starts at zero has no percentage to report.
    deltaPct: first === 0 ? null : roundToTenth(((value - first) / Math.abs(first)) * 100),
    updated: relativeLabel(refreshed === null ? 0 : deps.now.getTime() - refreshed),
  };
}
