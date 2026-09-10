import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { Database } from '@/lib/database.types';
import { MODELS } from '@/lib/models';
import type { ModelCallRecord } from '@/lib/openai/call';
import type { ChatMessage, ChatRequest } from '@/lib/openai/chat';
import type { StreamedChunk } from '@/lib/openai/call';
import type { CompleteInput } from '@/lib/openai/complete';

import { chunkRow, type ChunkRow } from './test-support';

const CHUNK_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const MESSAGE_ID = '99999999-9999-4999-8999-999999999999';
const ORG_ID = '55555555-5555-4555-8555-555555555555';

const models = {
  streamRequests: [] as ChatRequest[],
  streamDeltas: ['ENG-4417 ', 'blocks SSO.'],
  streamUsage: { inputTokens: 412, outputTokens: 9 },
  completions: [] as CompleteInput[],
  usage: [] as ModelCallRecord[],
  embedded: [] as { texts: readonly string[]; orgId: string }[],
};

vi.mock('@/lib/openai/chat', () => ({
  defaultChatStream: async () =>
    async function* (request: ChatRequest): AsyncGenerator<StreamedChunk<string>> {
      models.streamRequests.push(request);
      for (const delta of models.streamDeltas) yield { delta, usage: null };
      yield { delta: '', usage: models.streamUsage };
    },
}));

vi.mock('@/lib/openai/usage-recorder', () => ({
  recordModelCall: async (record: ModelCallRecord) => {
    models.usage.push(record);
  },
}));

vi.mock('@/lib/openai/complete', () => ({
  completeText: async (input: CompleteInput) => {
    models.completions.push(input);
    return 'Sso rollout blockers';
  },
}));

vi.mock('@/lib/openai/embed', () => ({
  embed: async ({ texts, orgId }: { texts: readonly string[]; orgId: string }) => {
    models.embedded.push({ texts, orgId });
    return [[0.5, 0.25]];
  },
}));

const { createAnswerDeps } = await import('./deps');

type ReaderClient = {
  readonly supabase: SupabaseClient<Database>;
  readonly inserts: { table: string; values: Record<string, unknown> }[];
  readonly searches: Record<string, unknown>[];
  readonly chunkLookups: string[][];
};

/** The reader's own client, which every call in these deps has to go through. */
function readerClient(rows: readonly ChunkRow[] = [chunkRow()]): ReaderClient {
  const inserts: { table: string; values: Record<string, unknown> }[] = [];
  const searches: Record<string, unknown>[] = [];
  const chunkLookups: string[][] = [];

  const supabase = {
    from: (table: string) => ({
      insert: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: MESSAGE_ID }, error: null }),
          }),
        };
      },
      select: () => ({
        in: (_column: string, ids: string[]) => {
          chunkLookups.push([...ids]);
          return Promise.resolve({
            data: rows.filter((row) => ids.includes(row.id)),
            error: null,
          });
        },
      }),
    }),
    rpc: (name: string, params: Record<string, unknown>) => {
      searches.push({ name, ...params });
      return Promise.resolve({
        data: [
          {
            chunk_id: CHUNK_ID,
            document_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            space_id: '33333333-3333-4333-8333-333333333333',
            content: 'The SSO rollout is blocked on ENG-4417.',
            score: 0.82,
          },
        ],
        error: null,
      });
    },
  } as unknown as SupabaseClient<Database>;

  return { supabase, inserts, searches, chunkLookups };
}

async function drain(
  stream: AsyncGenerator<string, { inputTokens: number; outputTokens: number }>,
): Promise<string> {
  let answer = '';
  let step = await stream.next();
  while (!step.done) {
    answer += step.value;
    step = await stream.next();
  }
  return answer;
}

const MESSAGES: readonly ChatMessage[] = [
  { role: 'system', content: 'Answer from the sources.' },
  { role: 'user', content: 'What blocks SSO?' },
];

beforeEach(() => {
  models.streamRequests = [];
  models.completions = [];
  models.usage = [];
  models.embedded = [];
});

describe('the answer turn deps', () => {
  it('streams the answer from the model pinned for chat', async () => {
    const deps = createAnswerDeps(readerClient().supabase);

    const answer = await drain(deps.streamAnswer({ orgId: ORG_ID, messages: MESSAGES }));

    expect(answer).toBe('ENG-4417 blocks SSO.');
    expect(models.streamRequests[0]).toMatchObject({ model: MODELS.chat, messages: MESSAGES });
  });

  it('meters the streamed answer against the organization that asked for it', async () => {
    const deps = createAnswerDeps(readerClient().supabase);

    await drain(deps.streamAnswer({ orgId: ORG_ID, messages: MESSAGES }));

    expect(models.usage).toEqual([
      expect.objectContaining({
        orgId: ORG_ID,
        purpose: 'chat',
        model: MODELS.chat,
        usage: { inputTokens: 412, outputTokens: 9 },
        succeeded: true,
      }),
    ]);
  });

  it('writes a question through the reader own client, so row level security applies', async () => {
    const client = readerClient();
    const deps = createAnswerDeps(client.supabase);

    const messageId = await deps.store.addUserMessage({
      conversationId: CONVERSATION_ID,
      content: 'What blocks SSO?',
    });

    expect(messageId).toBe(MESSAGE_ID);
    expect(client.inserts).toEqual([
      {
        table: 'messages',
        values: { conversation_id: CONVERSATION_ID, role: 'user', content: 'What blocks SSO?' },
      },
    ]);
  });

  it('retrieves through the reader own client, so they see only their own spaces', async () => {
    const client = readerClient();
    const deps = createAnswerDeps(client.supabase);

    const chunks = await deps.search({
      queryText: 'what blocks sso',
      spaceFilter: null,
      matchCount: 12,
      orgId: ORG_ID,
    });

    expect(client.searches[0]).toMatchObject({ name: 'search', query_text: 'what blocks sso' });
    expect(chunks).toEqual([expect.objectContaining({ chunkId: CHUNK_ID, score: 0.82 })]);
  });

  it('resolves citations through the reader own client', async () => {
    const client = readerClient();
    const deps = createAnswerDeps(client.supabase);

    const citations = await deps.resolveCitations([CHUNK_ID]);

    expect(client.chunkLookups).toEqual([[CHUNK_ID]]);
    expect(citations).toEqual([
      expect.objectContaining({ chunkId: CHUNK_ID, documentTitle: 'Q3 platform notes' }),
    ]);
  });

  it('rewrites a follow-up with the model pinned for condensing', async () => {
    const deps = createAnswerDeps(readerClient().supabase);

    const condensed = await deps.condense({
      question: 'What about last quarter?',
      history: [{ role: 'user', content: 'What blocks SSO?' }],
      orgId: ORG_ID,
    });

    expect(condensed).toEqual({ kind: 'rewritten', text: 'Sso rollout blockers' });
    expect(models.completions[0]).toMatchObject({ purpose: 'condense', orgId: ORG_ID });
  });

  it('names a conversation with the model pinned for titling', async () => {
    const deps = createAnswerDeps(readerClient().supabase);

    const title = await deps.generateTitle({ question: 'What blocks SSO?', orgId: ORG_ID });

    expect(title).toBe('Sso rollout blockers');
    expect(models.completions[0]).toMatchObject({ purpose: 'title', orgId: ORG_ID });
  });

  it('reads the wall clock, so a stored latency is a real duration', () => {
    const deps = createAnswerDeps(readerClient().supabase);

    const before = Date.now();
    const reading = deps.now();

    expect(reading).toBeGreaterThanOrEqual(before);
    expect(reading).toBeLessThanOrEqual(Date.now());
  });
});
