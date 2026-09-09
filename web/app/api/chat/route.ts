import { runAnswerTurn } from '@/lib/chat/answer';
import { createAnswerDeps } from '@/lib/chat/deps';
import {
  chatRequestSchema,
  encodeEvent,
  type ChatErrorBody,
  type ChatErrorCode,
} from '@/lib/chat/protocol';
import { PROMPT_HISTORY_TURNS } from '@/lib/chat/prompt';
import { loadConversation, loadMessages, toTurns } from '@/lib/chat/store';
import { createServiceClient } from '@/lib/supabase/service';
import { getSessionContext, type SessionContext } from '@/lib/supabase/context';

const RATE_LIMIT_PER_WINDOW = 30;
const RATE_LIMIT_WINDOW_S = 60;

const STATUS: Record<ChatErrorCode, number> = {
  unauthorized: 401,
  invalid_request: 400,
  not_found: 404,
  rate_limited: 429,
  // Payment Required. The plan is the thing in the way, and no amount of
  // waiting clears it.
  plan_limited: 402,
  server_error: 500,
};

/**
 * Streaming needs a route handler rather than a server action. Every failure
 * before the first token is a typed JSON body; every failure after it is an
 * error event inside the stream, so a reader never gets a truncated answer with
 * no explanation.
 */
export async function POST(request: Request): Promise<Response> {
  const context = await getSessionContext();
  if (!context) return failure('unauthorized', 'You need to sign in to ask a question.');

  const parsed = chatRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return failure('invalid_request', 'That question could not be read.');

  let limit;
  try {
    limit = await consumeRateLimit(context.userId);
  } catch (error) {
    // consume_rate_limit fails closed inside the database, so an error here is
    // the limiter being unreachable rather than a verdict. Answering anyway
    // would make the limit optional whenever Postgres hiccups.
    console.error('rate limit check failed', { userId: context.userId, error });
    return failure('server_error', 'Something went wrong. Ask again.');
  }

  if (!limit.allowed) {
    return failure('rate_limited', 'You are asking faster than we can answer. Try again shortly.', {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  const allowance = await checkQueryAllowance(context.supabase, context.orgId);
  if (!allowance.allowed) {
    return failure('plan_limited', allowance.reason);
  }

  const conversation = await loadConversation(context.supabase, parsed.data.conversationId);
  if (!conversation) return failure('not_found', 'That conversation is not available.');

  // Only the tail of a conversation reaches a model, so only the tail is read.
  const history = toTurns(
    await loadMessages(context.supabase, conversation.id, { limit: PROMPT_HISTORY_TURNS }),
  );

  const events = runAnswerTurn(
    {
      conversationId: conversation.id,
      orgId: context.orgId,
      question: parsed.data.message,
      spaceFilter: conversation.spaceFilter,
      history,
      needsTitle: conversation.title === null,
    },
    createAnswerDeps(context.supabase),
  );

  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        const step = await events.next();
        if (step.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(encodeEvent(step.value)));
      },
      cancel() {
        void events.return(undefined);
      },
    }),
    {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        // Proxies that buffer a response would hold the whole answer back.
        'X-Accel-Buffering': 'no',
      },
    },
  );
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const PLAN_LIMIT_REACHED = 'This organization has used its questions for the month.';

/**
 * The monthly question limit, which the usage panel displayed and nothing
 * enforced. Read through the caller's own client, the same way the upload page
 * reads `check_ingest_allowed`.
 */
async function checkQueryAllowance(
  supabase: SessionContext['supabase'],
  orgId: string,
): Promise<{ allowed: boolean; reason: string }> {
  const { data, error } = await supabase.rpc('check_query_allowed', { p_org_id: orgId }).single();

  // A limit that cannot be read is not a limit that has been passed. Refusing
  // here would take chat down whenever the function is unreachable.
  if (error) {
    console.error('query allowance check failed', { orgId, error });
    return { allowed: true, reason: '' };
  }

  return { allowed: data.allowed, reason: data.reason ?? PLAN_LIMIT_REACHED };
}

async function consumeRateLimit(
  userId: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { data, error } = await createServiceClient().rpc('consume_rate_limit', {
    p_bucket: `chat:${userId}`,
    p_limit: RATE_LIMIT_PER_WINDOW,
    p_window_s: RATE_LIMIT_WINDOW_S,
  });

  if (error) throw new Error(error.message);

  const verdict = data?.[0];
  return {
    allowed: verdict?.allowed ?? false,
    retryAfterSeconds: verdict?.retry_after_s ?? RATE_LIMIT_WINDOW_S,
  };
}

function failure(code: ChatErrorCode, message: string, headers: HeadersInit = {}): Response {
  const body: ChatErrorBody = { code, message };
  return Response.json(body, { status: STATUS[code], headers });
}
