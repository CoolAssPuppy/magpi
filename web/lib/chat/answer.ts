import type { ModelUsage } from '@/lib/openai/call';
import type { ChatMessage } from '@/lib/openai/chat';
import type { RetrievedChunk, SearchInput } from '@/lib/search/search';

import type { CondensedQuery, ConversationTurn } from './condense';
import { buildAnswerMessages } from './prompt';
import type { ChatEvent, Citation } from './protocol';
import type { ConversationStore } from './store';

export const ANSWER_FAILED = 'Something went wrong answering that. Ask again.';

export type AnswerTurnInput = {
  readonly conversationId: string;
  readonly orgId: string;
  readonly question: string;
  readonly spaceFilter: readonly string[] | null;
  readonly history: readonly ConversationTurn[];
  readonly needsTitle: boolean;
};

export type AnswerDeps = {
  readonly store: ConversationStore;
  readonly condense: (input: {
    question: string;
    history: readonly ConversationTurn[];
    orgId: string;
  }) => Promise<CondensedQuery>;
  readonly search: (input: SearchInput) => Promise<readonly RetrievedChunk[]>;
  readonly resolveCitations: (chunkIds: readonly string[]) => Promise<readonly Citation[]>;
  readonly streamAnswer: (input: {
    orgId: string;
    messages: readonly ChatMessage[];
  }) => AsyncGenerator<string, ModelUsage>;
  readonly generateTitle: (input: { question: string; orgId: string }) => Promise<string>;
  /** One answered question, against the organization's monthly allowance. */
  readonly recordQuery: (orgId: string) => Promise<void>;
  readonly now: () => number;
};

const MATCH_COUNT = 12;

/**
 * One turn of the conversation, as a sequence of events the route frames onto
 * the wire. The question is persisted before any model is called and the answer
 * after it completes, so a dropped connection leaves a conversation that can be
 * asked again rather than half an answer.
 */
export async function* runAnswerTurn(
  input: AnswerTurnInput,
  deps: AnswerDeps,
): AsyncGenerator<ChatEvent> {
  let userMessageId: string;
  let condensed: CondensedQuery;

  try {
    userMessageId = await deps.store.addUserMessage({
      conversationId: input.conversationId,
      content: input.question,
    });

    condensed = await deps.condense({
      question: input.question,
      history: input.history,
      orgId: input.orgId,
    });

    const chunks = await deps.search({
      queryText: condensed.text,
      spaceFilter: input.spaceFilter,
      matchCount: MATCH_COUNT,
      orgId: input.orgId,
    });

    const chunkIds = chunks.map((chunk) => chunk.chunkId);
    yield { type: 'citations', citations: [...(await deps.resolveCitations(chunkIds))] };

    const startedAt = deps.now();
    const stream = deps.streamAnswer({
      orgId: input.orgId,
      messages: buildAnswerMessages({
        question: input.question,
        chunks,
        history: input.history,
      }),
    });

    let answer = '';
    let step = await stream.next();
    while (!step.done) {
      answer += step.value;
      if (step.value !== '') yield { type: 'delta', text: step.value };
      step = await stream.next();
    }
    const usage = step.value;

    const messageId = await deps.store.addAssistantMessage({
      conversationId: input.conversationId,
      content: answer,
      citations: chunkIds,
      latencyMs: deps.now() - startedAt,
      tokenCount: usage.inputTokens + usage.outputTokens,
    });

    yield { type: 'done', messageId };
  } catch (error) {
    console.error('answer turn failed', { conversationId: input.conversationId, error });
    yield { type: 'error', message: ANSWER_FAILED };
    return;
  }

  // All three of these follow the closed answer, because none is worth a
  // millisecond of the reader's time waiting for a token. They have their own
  // try for the same reason: the answer is on screen and stored by the time
  // any of them runs, so a failed rewrite, a rate-limited title or an
  // unreachable meter has nothing left to tell the reader. Inside the block
  // above, a failed title write yielded an error event and took the delivered
  // answer off the screen.
  //
  // A meter that fails costs the organization one question. Failing the answer
  // to protect the meter is the wrong way round.
  try {
    await deps.recordQuery(input.orgId);

    if (condensed.kind === 'rewritten') {
      await deps.store.setCondensedQuery(userMessageId, condensed.text);
    }

    if (input.needsTitle) {
      const title = await deps.generateTitle({ question: input.question, orgId: input.orgId });
      await deps.store.setTitle(input.conversationId, title);
      yield { type: 'title', title };
    }
  } catch (error) {
    console.error('answer housekeeping failed', {
      conversationId: input.conversationId,
      error,
    });
  }
}
