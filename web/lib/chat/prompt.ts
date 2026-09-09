import type { ChatMessage } from '@/lib/openai/chat';
import type { RetrievedChunk } from '@/lib/search/search';

import type { ConversationTurn } from './condense';

export const PROMPT_HISTORY_TURNS = 8;

const ANSWER_INSTRUCTION = [
  "You are Recall, answering from one organization's own documents.",
  'Answer only from the passages below. Cite the passage you used inline as [1],',
  '[2], and so on, immediately after the sentence it supports. If the passages do',
  'not answer the question, say what is missing and name what would answer it.',
  'Never invent a source, a number or a name. Be direct and brief.',
].join(' ');

export type AnswerPromptInput = {
  readonly question: string;
  readonly chunks: readonly RetrievedChunk[];
  readonly history: readonly ConversationTurn[];
};

export function buildAnswerMessages(input: AnswerPromptInput): readonly ChatMessage[] {
  return [
    { role: 'system', content: ANSWER_INSTRUCTION },
    { role: 'system', content: contextBlock(input.chunks) },
    ...input.history.slice(-PROMPT_HISTORY_TURNS),
    { role: 'user', content: input.question },
  ];
}

function contextBlock(chunks: readonly RetrievedChunk[]): string {
  if (chunks.length === 0) return 'No passages were retrieved for this question.';

  const passages = chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.content}`)
    .join('\n\n');

  return `Passages:\n\n${passages}`;
}
