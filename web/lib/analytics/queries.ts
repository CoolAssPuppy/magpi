import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

import { bucketByDay, groupQuestions, type DailyBucket, type QuestionCount } from './series';

export type AnalyticsClient = SupabaseClient<Database>;

type Enums = Database['public']['Enums'];

/**
 * How many recent failures one page load looks at. The panel names a reason and
 * a count, not an audit trail, and PostgREST caps a response at 1000 rows anyway.
 */
const RECENT_FAILURE_SAMPLE = 200;

/** Same cap, for the two message-derived panels. */
const MESSAGE_SAMPLE = 1000;

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('query returned no rows');
  return result.data;
}

function unwrapCount(result: { count: number | null; error: { message: string } | null }): number {
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

function daysAgoIso(now: Date, days: number): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1))
    .toISOString()
    .replace('.000Z', '.000Z');
}

function monthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export type IngestFailure = {
  readonly status: Enums['ingest_status'];
  readonly stage: Enums['ingest_stage'];
  readonly error: string | null;
};

export type IngestHealthRow = {
  readonly connectionId: string;
  readonly provider: string;
  readonly status: Enums['connection_status'];
  readonly statusDetail: string | null;
  readonly lastSyncedAt: string | null;
  readonly documentsPulled: number;
  readonly recentFailures: number;
  readonly latestFailure: IngestFailure | null;
};

/**
 * One row per connection: is it syncing, when did it last succeed, how much did
 * it pull, and what killed the last job. A timed-out Edge Function is only
 * actionable if the person who can fix it can see the stage it died in.
 */
export async function fetchIngestHealth(
  client: AnalyticsClient,
  orgId: string,
): Promise<readonly IngestHealthRow[]> {
  const connectionsQuery = client
    .from('connections')
    .select('id, provider, status, status_detail, last_synced_at, documents(count)')
    .eq('org_id', orgId)
    .order('provider', { ascending: true });

  const failuresQuery = client
    .from('ingest_jobs')
    .select('connection_id, status, stage, error, updated_at')
    .eq('org_id', orgId)
    .in('status', ['failed', 'timeout'])
    .order('updated_at', { ascending: false })
    .limit(RECENT_FAILURE_SAMPLE);

  const [connections, failures] = await Promise.all([connectionsQuery, failuresQuery]);

  const connectionRows = unwrap(connections);
  const failureRows = unwrap(failures);

  return connectionRows.map((connection) => {
    const own = failureRows.filter((failure) => failure.connection_id === connection.id);
    const latest = own[0];

    return {
      connectionId: connection.id,
      provider: connection.provider,
      status: connection.status,
      statusDetail: connection.status_detail,
      lastSyncedAt: connection.last_synced_at,
      documentsPulled: connection.documents[0]?.count ?? 0,
      recentFailures: own.length,
      latestFailure: latest
        ? { status: latest.status, stage: latest.stage, error: latest.error }
        : null,
    };
  });
}

/**
 * Queries per day with p50 and p95, from the assistant turns. The inner join on
 * conversations is what scopes it to an organization: messages carry no org_id.
 */
export async function fetchAnswerLatency(
  client: AnalyticsClient,
  orgId: string,
  { days, now }: { days: number; now: Date },
): Promise<readonly DailyBucket[]> {
  const result = await client
    .from('messages')
    .select('created_at, latency_ms, conversations!inner(org_id)')
    .eq('conversations.org_id', orgId)
    .eq('role', 'assistant')
    .gte('created_at', daysAgoIso(now, days))
    .order('created_at', { ascending: true })
    .limit(MESSAGE_SAMPLE);

  const rows = unwrap(result);

  return bucketByDay(
    rows.map((row) => ({ occurredAt: row.created_at, latencyMs: row.latency_ms })),
    { days, now },
  );
}

export async function fetchTopQuestions(
  client: AnalyticsClient,
  orgId: string,
  { days, limit, now }: { days: number; limit: number; now: Date },
): Promise<readonly QuestionCount[]> {
  const result = await client
    .from('messages')
    .select('content, created_at, conversations!inner(org_id)')
    .eq('conversations.org_id', orgId)
    .eq('role', 'user')
    .gte('created_at', daysAgoIso(now, days))
    .order('created_at', { ascending: false })
    .limit(MESSAGE_SAMPLE);

  const rows = unwrap(result);

  return groupQuestions(
    rows.map((row) => ({ content: row.content, createdAt: row.created_at })),
    limit,
  );
}

export type DeadDocument = {
  readonly id: string;
  readonly title: string;
  readonly spaceId: string;
  readonly origin: Enums['document_origin'];
  readonly createdAt: string;
};

export type DeadContent = {
  readonly totalDocuments: number;
  readonly neverRetrieved: number;
  readonly samples: readonly DeadDocument[];
};

/**
 * Documents no answer has ever cited. Half a knowledge base is usually dead, and
 * the count is the point: the sample is only there to make it concrete.
 */
export async function fetchDeadContent(
  client: AnalyticsClient,
  orgId: string,
  { sampleSize }: { sampleSize: number },
): Promise<DeadContent> {
  const totalQuery = client
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  const deadQuery = client
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .is('last_retrieved_at', null);

  const sampleQuery = client
    .from('documents')
    .select('id, title, space_id, origin, created_at')
    .eq('org_id', orgId)
    .is('last_retrieved_at', null)
    .order('created_at', { ascending: true })
    .limit(sampleSize);

  const [total, dead, samples] = await Promise.all([totalQuery, deadQuery, sampleQuery]);

  return {
    totalDocuments: unwrapCount(total),
    neverRetrieved: unwrapCount(dead),
    samples: unwrap(samples).map((row) => ({
      id: row.id,
      title: row.title,
      spaceId: row.space_id,
      origin: row.origin,
      createdAt: row.created_at,
    })),
  };
}

export type Meter = {
  readonly used: number;
  readonly limit: number | null;
};

export type PlanUsage = {
  readonly plan: Enums['org_plan'];
  readonly documents: Meter;
  readonly queries: Meter;
  readonly seats: Meter;
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;
};

async function sumUsage(
  client: AnalyticsClient,
  orgId: string,
  kind: Enums['usage_kind'],
  since: string | null,
): Promise<number> {
  const base = client
    .from('usage_events')
    .select('kind, quantity.sum()')
    .eq('org_id', orgId)
    .eq('kind', kind);

  const result = await (since ? base.gte('occurred_at', since) : base);

  return unwrap(result)[0]?.sum ?? 0;
}

/**
 * Usage is read from usage_events and the limits from the plan functions, so a
 * page load never scans documents and the numbers on screen are the same ones
 * check_ingest_allowed enforces against.
 */
export async function fetchPlanUsage(
  client: AnalyticsClient,
  orgId: string,
  { now }: { now: Date },
): Promise<PlanUsage> {
  const organizationQuery = client
    .from('organizations')
    .select('plan, seats, stripe_customer_id, stripe_subscription_id')
    .eq('id', orgId)
    .single();

  const seatsQuery = client
    .from('org_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  const [organization, seats, documentsUsed, queriesUsed] = await Promise.all([
    organizationQuery,
    seatsQuery,
    sumUsage(client, orgId, 'document_ingested', null),
    sumUsage(client, orgId, 'query', monthStartIso(now)),
  ]);

  const org = unwrap(organization);

  const [documentLimit, queryLimit] = await Promise.all([
    client.rpc('plan_document_limit', { p_plan: org.plan }),
    client.rpc('plan_monthly_query_limit', { p_plan: org.plan }),
  ]);

  return {
    plan: org.plan,
    documents: { used: documentsUsed, limit: unwrap(documentLimit) },
    queries: { used: queriesUsed, limit: unwrap(queryLimit) },
    seats: { used: unwrapCount(seats), limit: org.seats },
    stripeCustomerId: org.stripe_customer_id,
    stripeSubscriptionId: org.stripe_subscription_id,
  };
}
