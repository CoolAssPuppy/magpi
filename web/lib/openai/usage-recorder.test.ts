import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/lib/database.types';
import { MODELS } from '@/lib/models';

import type { ModelCallRecord } from './call';

vi.mock('server-only', () => ({}));

const ORG_ID = '55555555-5555-4555-8555-555555555555';

type WrittenRow = { readonly table: string; readonly values: Record<string, unknown> };

const service = {
  rows: [] as WrittenRow[],
  refusals: {} as Record<string, { message: string } | undefined>,
};

/**
 * Stands in for the service client. The cast is confined here: this is the one
 * place a test double has to answer for a client whose full surface it does not
 * implement.
 */
function serviceClient(): SupabaseClient<Database> {
  return {
    from: (table: string) => ({
      insert: (values: Record<string, unknown>) => {
        service.rows.push({ table, values });
        return Promise.resolve({ error: service.refusals[table] ?? null });
      },
    }),
  } as unknown as SupabaseClient<Database>;
}

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => serviceClient() }));

const { recordModelCall } = await import('./usage-recorder');

function modelCall(overrides: Partial<ModelCallRecord> = {}): ModelCallRecord {
  return {
    orgId: ORG_ID,
    purpose: 'chat',
    model: MODELS.chat,
    usage: { inputTokens: 320, outputTokens: 84 },
    latencyMs: 1180,
    succeeded: true,
    ...overrides,
  };
}

function rowsFor(table: string): readonly Record<string, unknown>[] {
  return service.rows.filter((row) => row.table === table).map((row) => row.values);
}

beforeEach(() => {
  service.rows = [];
  service.refusals = {};
});

describe('recording a model call', () => {
  it('records which model answered, what it cost and how long it took', async () => {
    await recordModelCall(modelCall());

    expect(rowsFor('model_calls')).toEqual([
      {
        org_id: ORG_ID,
        purpose: 'chat',
        model: MODELS.chat,
        input_tokens: 320,
        output_tokens: 84,
        latency_ms: 1180,
        succeeded: true,
      },
    ]);
  });

  it('meters every token an answer spent against the organization', async () => {
    await recordModelCall(modelCall());

    expect(rowsFor('usage_events')).toEqual([
      { org_id: ORG_ID, kind: 'chat_tokens', quantity: 404 },
    ]);
  });

  it('meters embedding tokens under their own kind, so the two never blur', async () => {
    await recordModelCall(
      modelCall({
        purpose: 'embedding',
        model: MODELS.embedding,
        usage: { inputTokens: 41, outputTokens: 0 },
      }),
    );

    expect(rowsFor('usage_events')).toEqual([
      { org_id: ORG_ID, kind: 'embedding_tokens', quantity: 41 },
    ]);
  });

  it('still records a call that failed, so a model regression is visible', async () => {
    await recordModelCall(
      modelCall({ succeeded: false, usage: { inputTokens: 0, outputTokens: 0 } }),
    );

    expect(rowsFor('model_calls')).toEqual([
      expect.objectContaining({ model: MODELS.chat, succeeded: false, latency_ms: 1180 }),
    ]);
  });

  it('charges nothing for a call that spent nothing', async () => {
    await recordModelCall(
      modelCall({ succeeded: false, usage: { inputTokens: 0, outputTokens: 0 } }),
    );

    expect(rowsFor('usage_events')).toEqual([]);
  });

  it('raises when the call could not be recorded, rather than losing it quietly', async () => {
    service.refusals.model_calls = { message: 'permission denied for table model_calls' };

    await expect(recordModelCall(modelCall())).rejects.toThrow(
      'permission denied for table model_calls',
    );
  });

  it('raises when the meter could not be written', async () => {
    service.refusals.usage_events = { message: 'permission denied for table usage_events' };

    await expect(recordModelCall(modelCall())).rejects.toThrow(
      'permission denied for table usage_events',
    );
  });
});
