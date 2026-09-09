import { describe, expect, it } from 'vitest';

import {
  fetchAnswerLatency,
  fetchDeadContent,
  fetchIngestHealth,
  fetchPlanUsage,
  fetchTopQuestions,
  type AnalyticsClient,
} from './queries';

type StubResponse = {
  readonly data?: unknown;
  readonly count?: number;
  readonly error?: { readonly message: string };
};

type RecordedCall = readonly [string, ...unknown[]];

type Stub = {
  readonly client: AnalyticsClient;
  readonly callsFor: (source: string) => readonly RecordedCall[];
};

/**
 * A postgrest builder that records the chain instead of talking to a database.
 * Recording is the point: these functions are the SQL for each panel, so a test
 * that does not look at the filters is not testing anything.
 *
 * The cast is confined to this factory. It is the one place a test double has to
 * stand in for a client whose full surface it does not implement.
 */
function createStub(responses: Readonly<Record<string, readonly StubResponse[]>>): Stub {
  const calls = new Map<string, RecordedCall[]>();
  const queues = new Map<string, StubResponse[]>(
    Object.entries(responses).map(([source, list]) => [source, [...list]]),
  );

  function builderFor(source: string, initial: RecordedCall): unknown {
    const recorded = calls.get(source) ?? [];
    recorded.push(initial);
    calls.set(source, recorded);

    // Claimed when the builder is created, not when it is awaited, so a panel
    // that issues its queries concurrently still reads them back in source order.
    const next = queues.get(source)?.shift();
    if (!next) throw new Error(`stub has no response left for ${source}`);
    const settled = {
      data: next.data ?? null,
      count: next.count ?? null,
      error: next.error ?? null,
    };

    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(settled).then(resolve),
    };

    for (const method of ['select', 'eq', 'in', 'is', 'gte', 'order', 'limit', 'single']) {
      builder[method] = (...args: unknown[]) => {
        recorded.push([method, ...args]);
        return builder;
      };
    }

    return builder;
  }

  const client = {
    from: (table: string) => builderFor(table, ['from', table]),
    rpc: (name: string, args: unknown) => builderFor(name, ['rpc', name, args]),
  } as unknown as AnalyticsClient;

  return { client, callsFor: (source) => calls.get(source) ?? [] };
}

const ORG = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-09T14:20:00.000Z');

describe('ingest health', () => {
  it('reports documents pulled and the reason the last job died, per connection', async () => {
    const stub = createStub({
      connections: [
        {
          data: [
            {
              id: 'c1',
              provider: 'notion',
              status: 'error',
              status_detail: 'token expired',
              last_synced_at: '2026-09-08T02:00:00.000Z',
              documents: [{ count: 42 }],
            },
          ],
        },
      ],
      ingest_jobs: [
        {
          data: [
            {
              connection_id: 'c1',
              status: 'timeout',
              stage: 'embed',
              error: 'wall clock exceeded',
              updated_at: '2026-09-08T02:04:00.000Z',
            },
            {
              connection_id: 'c1',
              status: 'failed',
              stage: 'fetch',
              error: '401 from Notion',
              updated_at: '2026-09-07T02:00:00.000Z',
            },
          ],
        },
      ],
    });

    const rows = await fetchIngestHealth(stub.client, ORG);

    expect(rows).toEqual([
      {
        connectionId: 'c1',
        provider: 'notion',
        status: 'error',
        statusDetail: 'token expired',
        lastSyncedAt: '2026-09-08T02:00:00.000Z',
        documentsPulled: 42,
        recentFailures: 2,
        latestFailure: { status: 'timeout', stage: 'embed', error: 'wall clock exceeded' },
      },
    ]);
  });

  it('asks only for the failed and timed out jobs of one organization', async () => {
    const stub = createStub({
      connections: [{ data: [] }],
      ingest_jobs: [{ data: [] }],
    });

    await fetchIngestHealth(stub.client, ORG);

    expect(stub.callsFor('ingest_jobs')).toContainEqual(['eq', 'org_id', ORG]);
    expect(stub.callsFor('ingest_jobs')).toContainEqual(['in', 'status', ['failed', 'timeout']]);
    expect(stub.callsFor('connections')).toContainEqual(['eq', 'org_id', ORG]);
  });

  it('reports a healthy connection with no failure', async () => {
    const stub = createStub({
      connections: [
        {
          data: [
            {
              id: 'c1',
              provider: 'linear',
              status: 'active',
              status_detail: null,
              last_synced_at: null,
              documents: [],
            },
          ],
        },
      ],
      ingest_jobs: [{ data: [] }],
    });

    const rows = await fetchIngestHealth(stub.client, ORG);

    expect(rows[0].documentsPulled).toBe(0);
    expect(rows[0].recentFailures).toBe(0);
    expect(rows[0].latestFailure).toBeNull();
  });

  it('throws when the database refuses the query', async () => {
    const stub = createStub({
      connections: [{ error: { message: 'permission denied' } }],
      ingest_jobs: [{ data: [] }],
    });

    await expect(fetchIngestHealth(stub.client, ORG)).rejects.toThrow('permission denied');
  });
});

describe('answer latency', () => {
  it('buckets assistant answers by day', async () => {
    const stub = createStub({
      messages: [
        {
          data: [
            { created_at: '2026-09-09T09:00:00.000Z', latency_ms: 300 },
            { created_at: '2026-09-09T10:00:00.000Z', latency_ms: 1200 },
          ],
        },
      ],
    });

    const days = await fetchAnswerLatency(stub.client, ORG, { days: 2, now: NOW });

    expect(days).toHaveLength(2);
    expect(days[1]).toEqual({ day: '2026-09-09', queries: 2, p50Ms: 300, p95Ms: 1200 });
  });

  it('reads only assistant turns inside this organization', async () => {
    const stub = createStub({ messages: [{ data: [] }] });

    await fetchAnswerLatency(stub.client, ORG, { days: 30, now: NOW });

    const calls = stub.callsFor('messages');
    expect(calls).toContainEqual(['eq', 'conversations.org_id', ORG]);
    expect(calls).toContainEqual(['eq', 'role', 'assistant']);
    expect(calls).toContainEqual(['gte', 'created_at', '2026-08-11T00:00:00.000Z']);
  });

  it('throws when the database refuses the query', async () => {
    const stub = createStub({ messages: [{ error: { message: 'nope' } }] });

    await expect(fetchAnswerLatency(stub.client, ORG, { days: 7, now: NOW })).rejects.toThrow(
      'nope',
    );
  });
});

describe('top questions', () => {
  it('ranks what people actually asked', async () => {
    const stub = createStub({
      messages: [
        {
          data: [
            { content: 'Where is the runbook?', created_at: '2026-09-09T09:00:00.000Z' },
            { content: 'where is the runbook', created_at: '2026-09-08T09:00:00.000Z' },
            { content: 'How do I rotate a key?', created_at: '2026-09-07T09:00:00.000Z' },
          ],
        },
      ],
    });

    const top = await fetchTopQuestions(stub.client, ORG, { days: 30, limit: 10, now: NOW });

    expect(top[0]).toEqual({
      question: 'Where is the runbook?',
      askedCount: 2,
      lastAskedAt: '2026-09-09T09:00:00.000Z',
    });
    expect(top).toHaveLength(2);
  });

  it('reads only user turns inside this organization', async () => {
    const stub = createStub({ messages: [{ data: [] }] });

    await fetchTopQuestions(stub.client, ORG, { days: 30, limit: 10, now: NOW });

    const calls = stub.callsFor('messages');
    expect(calls).toContainEqual(['eq', 'conversations.org_id', ORG]);
    expect(calls).toContainEqual(['eq', 'role', 'user']);
  });

  it('throws when the database refuses the query', async () => {
    const stub = createStub({ messages: [{ error: { message: 'nope' } }] });

    await expect(
      fetchTopQuestions(stub.client, ORG, { days: 30, limit: 10, now: NOW }),
    ).rejects.toThrow('nope');
  });
});

describe('dead content', () => {
  it('counts what has never been retrieved and samples the oldest of it', async () => {
    const stub = createStub({
      documents: [
        { count: 120 },
        { count: 74 },
        {
          data: [
            {
              id: 'd1',
              title: 'Q1 offsite notes',
              space_id: 's1',
              origin: 'sync',
              created_at: '2026-02-01T00:00:00.000Z',
            },
          ],
        },
      ],
    });

    const dead = await fetchDeadContent(stub.client, ORG, { sampleSize: 10 });

    expect(dead.totalDocuments).toBe(120);
    expect(dead.neverRetrieved).toBe(74);
    expect(dead.samples).toEqual([
      {
        id: 'd1',
        title: 'Q1 offsite notes',
        spaceId: 's1',
        origin: 'sync',
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
  });

  it('filters the sample to documents with no retrieval', async () => {
    const stub = createStub({ documents: [{ count: 0 }, { count: 0 }, { data: [] }] });

    await fetchDeadContent(stub.client, ORG, { sampleSize: 10 });

    expect(stub.callsFor('documents')).toContainEqual(['is', 'last_retrieved_at', null]);
  });

  it('throws when the database refuses the query', async () => {
    const stub = createStub({
      documents: [{ error: { message: 'nope' } }, { count: 0 }, { data: [] }],
    });

    await expect(fetchDeadContent(stub.client, ORG, { sampleSize: 10 })).rejects.toThrow('nope');
  });
});

describe('usage against plan', () => {
  it('reads metered usage rather than counting documents', async () => {
    const stub = createStub({
      organizations: [
        {
          data: {
            plan: 'free',
            seats: 1,
            stripe_customer_id: null,
            stripe_subscription_id: null,
          },
        },
      ],
      org_members: [{ count: 3 }],
      usage_events: [
        { data: [{ kind: 'document_ingested', sum: 88 }] },
        { data: [{ kind: 'query', sum: 140 }] },
      ],
      plan_document_limit: [{ data: 200 }],
      plan_monthly_query_limit: [{ data: 500 }],
    });

    const usage = await fetchPlanUsage(stub.client, ORG, { now: NOW });

    expect(usage).toEqual({
      plan: 'free',
      documents: { used: 88, limit: 200 },
      queries: { used: 140, limit: 500 },
      seats: { used: 3, limit: 1 },
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    expect(stub.callsFor('documents')).toEqual([]);
  });

  it('counts queries from the start of the current month', async () => {
    const stub = createStub({
      organizations: [
        {
          data: {
            plan: 'team',
            seats: 5,
            stripe_customer_id: 'cus_1',
            stripe_subscription_id: 'sub_1',
          },
        },
      ],
      org_members: [{ count: 5 }],
      usage_events: [{ data: [] }, { data: [] }],
      plan_document_limit: [{ data: 25000 }],
      plan_monthly_query_limit: [{ data: 50000 }],
    });

    const usage = await fetchPlanUsage(stub.client, ORG, { now: NOW });

    expect(stub.callsFor('usage_events')).toContainEqual([
      'gte',
      'occurred_at',
      '2026-09-01T00:00:00.000Z',
    ]);
    expect(usage.documents.used).toBe(0);
    expect(usage.stripeCustomerId).toBe('cus_1');
  });

  it('throws when the organization cannot be read', async () => {
    const stub = createStub({
      organizations: [{ error: { message: 'permission denied' } }],
      org_members: [{ count: 0 }],
      usage_events: [{ data: [] }, { data: [] }],
    });

    await expect(fetchPlanUsage(stub.client, ORG, { now: NOW })).rejects.toThrow(
      'permission denied',
    );
  });
});
