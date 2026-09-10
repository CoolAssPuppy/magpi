import { completeText } from '@/lib/openai/complete';
import type { ChatMessage } from '@/lib/openai/chat';

export type ConversationTurn = {
  readonly role: 'user' | 'assistant';
  readonly content: string;
};

/** A question rewritten to stand alone. Retrieval uses this, the answer uses the original. */
export type CondensedQuery =
  | { readonly kind: 'original'; readonly text: string }
  | { readonly kind: 'rewritten'; readonly text: string };

export const CONDENSE_HISTORY_TURNS = 6;

const CONDENSE_MAX_TOKENS = 120;

const CONDENSE_INSTRUCTION = [
  'Rewrite the final question so it can be understood on its own, without the',
  'conversation above it. Resolve pronouns and implied subjects using that',
  'conversation. Keep the wording and any names, numbers or identifiers the',
  'person used. Answer with the rewritten question and nothing else. If the',
  'question already stands alone, repeat it unchanged.',
].join(' ');

export function buildCondenseMessages(
  history: readonly ConversationTurn[],
  question: string,
): readonly ChatMessage[] {
  const recent = history.slice(-CONDENSE_HISTORY_TURNS);
  const transcript = recent.map((turn) => `${turn.role}: ${turn.content}`).join('\n');

  return [
    { role: 'system', content: CONDENSE_INSTRUCTION },
    { role: 'user', content: `${transcript}\n\nFinal question: ${question}` },
  ];
}

export type CondenseInput = {
  readonly question: string;
  readonly history: readonly ConversationTurn[];
  readonly orgId: string;
};

export type CondenseDeps = {
  readonly complete?: (messages: readonly ChatMessage[], orgId: string) => Promise<string>;
};

export async function condenseQuestion(
  input: CondenseInput,
  deps: CondenseDeps = {},
): Promise<CondensedQuery> {
  if (input.history.length === 0) return { kind: 'original', text: input.question };

  const complete = deps.complete ?? defaultComplete;
  const rewritten = (
    await complete(buildCondenseMessages(input.history, input.question), input.orgId)
  ).trim();

  if (rewritten === '') return { kind: 'original', text: input.question };
  return { kind: 'rewritten', text: rewritten };
}

function defaultComplete(messages: readonly ChatMessage[], orgId: string): Promise<string> {
  return completeText({
    purpose: 'condense',
    orgId,
    messages,
    maxOutputTokens: CONDENSE_MAX_TOKENS,
  });
}
