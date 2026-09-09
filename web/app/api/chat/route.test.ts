import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnswerDeps } from '@/lib/chat/answer';
import { decodeEvents, type ChatEvent } from '@/lib/chat/protocol';
import { recordingClient } from '@/lib/chat/test-support';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '77777777-7777-4777-8777-777777777777';

const sessionState = {
  context: null as unknown,
};

const rateLimitState = {
  allowed: true,
  retryAfterSeconds: 12,
};

const answerState = {
  events: [] as ChatEvent[],
  seenInput: null as unknown,
  abandoned: false,
};

vi.mock('@/lib/supabase/context', () => ({
  getSessionContext: async () => sessionState.context,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: async () => ({
      data: [
        {
          allowed: rateLimitState.allowed,
          remaining: 0,
          retry_after_s: rateLimitState.retryAfterSeconds,
        },
      ],
      error: null,
    }),
  }),
}));

vi.mock('@/lib/chat/deps', () => ({
  createAnswerDeps: () => ({}) as AnswerDeps,
}));

vi.mock('@/lib/chat/answer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chat/answer')>()),
  runAnswerTurn: async function* (input: unknown) {
    answerState.seenInput = input;
    try {
      for (const event of answerState.events) yield event;
    } finally {
      answerState.abandoned = true;
    }
  },
}));

const { POST } = await import('./route');

function signedIn(
  overrides: {
    conversation?: unknown;
    messages?: readonly unknown[];
    allowance?: { data?: unknown; error?: { message: string } | null };
  } = {},
) {
  const { supabase } = recordingClient({
    maybeSingle:
      overrides.conversation === undefined
        ? { id: CONVERSATION_ID, space_filter: null, title: null }
        : overrides.conversation,
    rows: overrides.messages ?? [],
    rpc: {
      check_query_allowed: overrides.allowance ?? {
        data: { allowed: true, reason: null, used: 3, plan_limit: 500 },
      },
    },
  });

  return {
    userId: USER_ID,
    email: 'reader@example.com',
    orgId: 'org-1',
    role: 'member',
    supabase,
  };
}

function ask(body: unknown): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function readEvents(response: Response): Promise<readonly ChatEvent[]> {
  return decodeEvents(await response.text()).events;
}

beforeEach(() => {
  sessionState.context = signedIn();
  rateLimitState.allowed = true;
  answerState.abandoned = false;
  answerState.events = [
    { type: 'delta', text: 'Blocked on ENG-4417.' },
    { type: 'done', messageId: '66666666-6666-4666-8666-666666666666' },
  ];
});

describe('POST /api/chat', () => {
  it('refuses a caller with no session', async () => {
    sessionState.context = null;

    const response = await POST(ask({ conversationId: CONVERSATION_ID, message: 'hello' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'unauthorized' });
  });

  it('refuses a body it cannot read', async () => {
    const response = await POST(ask({ conversationId: 'not-a-uuid', message: '' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_request' });
  });

  // The monthly limit plan_monthly_query_limit describes, which the usage panel
  // displayed and nothing enforced.
  it('refuses a caller whose organization has used its questions for the month', async () => {
    sessionState.context = signedIn({
      allowance: {
        data: {
          allowed: false,
          reason: 'question limit reached for free plan',
          used: 500,
          plan_limit: 500,
        },
      },
    });

    const response = await POST(ask({ conversationId: CONVERSATION_ID, message: 'hello' }));

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      code: 'plan_limited',
      message: 'question limit reached for free plan',
    });
  });

  // A limit that cannot be read has not been passed. Refusing here would take
  // chat down for everyone whenever the function is unreachable.
  it('answers anyway when the allowance itself cannot be read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionState.context = signedIn({ allowance: { error: { message: 'connection reset' } } });

    const response = await POST(ask({ conversationId: CONVERSATION_ID, message: 'hello' }));

    expect(response.status).toBe(200);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('refuses a caller over the rate limit and says when to come back', async () => {
    rateLimitState.allowed = false;

    const response = await POST(ask({ conversationId: CONVERSATION_ID, message: 'hello' }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(await response.json()).toMatchObject({ code: 'rate_limited' });
  });

  it('refuses a conversation the reader cannot see', async () => {
    sessionState.context = signedIn({ conversation: null });

    const response = await POST(ask({ conversationId: CONVERSATION_ID, message: 'hello' }));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'not_found' });
  });

  it('streams the turn as newline delimited events', async () => {
    const response = await POST(
      ask({ conversationId: CONVERSATION_ID, message: 'What is blocking SSO?' }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/x-ndjson; charset=utf-8');
    expect(await readEvents(response)).toEqual(answerState.events);
  });

  it('asks for a title only while the conversation has none', async () => {
    sessionState.context = signedIn({
      conversation: { id: CONVERSATION_ID, space_filter: null, title: 'Already named' },
    });

    await POST(ask({ conversationId: CONVERSATION_ID, message: 'hello' })).then(readEvents);

    expect(answerState.seenInput).toMatchObject({ needsTitle: false });
  });

  it('narrows retrieval to the spaces the conversation was filtered to', async () => {
    sessionState.context = signedIn({
      conversation: { id: CONVERSATION_ID, space_filter: ['space-1'], title: null },
    });

    await POST(ask({ conversationId: CONVERSATION_ID, message: 'hello' })).then(readEvents);

    expect(answerState.seenInput).toMatchObject({ spaceFilter: ['space-1'] });
  });

  it('abandons the turn when the reader drops the connection', async () => {
    const response = await POST(ask({ conversationId: CONVERSATION_ID, message: 'hello' }));
    const reader = response.body?.getReader();

    await reader?.read();
    await reader?.cancel();

    expect(answerState.abandoned).toBe(true);
  });

  it('replays the earlier turns of the conversation', async () => {
    sessionState.context = signedIn({
      messages: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          role: 'user',
          content: 'How did revenue look in Q2?',
          citations: [],
          created_at: '2026-09-09T10:00:00Z',
        },
      ],
    });

    await POST(ask({ conversationId: CONVERSATION_ID, message: 'What about Q1?' })).then(
      readEvents,
    );

    expect(answerState.seenInput).toMatchObject({
      history: [{ role: 'user', content: 'How did revenue look in Q2?' }],
      question: 'What about Q1?',
    });
  });
});
