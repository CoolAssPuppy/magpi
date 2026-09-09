import { completeText } from '@/lib/openai/complete';
import type { ChatMessage } from '@/lib/openai/chat';

export const TITLE_MAX_LENGTH = 60;

const TITLE_MAX_TOKENS = 24;

const TITLE_INSTRUCTION = [
  'Name this conversation from the question that opened it. Six words at most,',
  'no quotation marks, no trailing punctuation, sentence case. Keep any names,',
  'products or identifiers the person used. Answer with the name and nothing else.',
].join(' ');

export function normalizeTitle(raw: string, fallback = ''): string {
  const cleaned = raw
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '');

  if (cleaned === '') return normalizeFallback(fallback);
  return truncateAtWord(cleaned);
}

export type TitleInput = {
  readonly question: string;
  readonly orgId: string;
};

export type TitleDeps = {
  readonly complete?: (messages: readonly ChatMessage[], orgId: string) => Promise<string>;
};

/**
 * Runs after the answer is closed, so naming a conversation never delays one.
 * A conversation the model could not name is titled from the question instead
 * of being left blank.
 */
export async function generateTitle(input: TitleInput, deps: TitleDeps = {}): Promise<string> {
  const complete = deps.complete ?? defaultComplete;
  const messages: readonly ChatMessage[] = [
    { role: 'system', content: TITLE_INSTRUCTION },
    { role: 'user', content: input.question },
  ];

  try {
    return normalizeTitle(await complete(messages, input.orgId), input.question);
  } catch (error) {
    console.error('conversation title failed', { orgId: input.orgId, error });
    return normalizeTitle('', input.question);
  }
}

function normalizeFallback(fallback: string): string {
  const collapsed = fallback.replace(/\s+/g, ' ').trim();
  return collapsed === '' ? 'New conversation' : truncateAtWord(collapsed);
}

function truncateAtWord(text: string): string {
  if (text.length <= TITLE_MAX_LENGTH) return text;

  const cut = text.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}

function defaultComplete(messages: readonly ChatMessage[], orgId: string): Promise<string> {
  return completeText({ purpose: 'title', orgId, messages, maxOutputTokens: TITLE_MAX_TOKENS });
}
