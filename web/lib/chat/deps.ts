import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { callModelStreaming } from '@/lib/openai/call';
import { defaultChatStream } from '@/lib/openai/chat';
import { searchChunks } from '@/lib/search/search';

import type { AnswerDeps } from './answer';
import { resolveCitations } from './citations';
import { condenseQuestion } from './condense';
import { recordQuery } from './meter';
import { createConversationStore } from './store';
import { generateTitle } from './title';

const ANSWER_MAX_TOKENS = 900;

/** Binds the answer turn to one reader's client and to the real models. */
export function createAnswerDeps(supabase: SupabaseClient<Database>): AnswerDeps {
  return {
    store: createConversationStore(supabase),
    condense: (input) => condenseQuestion(input),
    search: (input) => searchChunks(input, { supabase }),
    resolveCitations: (chunkIds) => resolveCitations(supabase, [...chunkIds]),
    generateTitle: (input) => generateTitle(input),
    recordQuery: (orgId) => recordQuery(orgId),
    now: () => Date.now(),

    streamAnswer: ({ orgId, messages }) =>
      callModelStreaming({
        purpose: 'chat',
        orgId,
        run: async function* (model) {
          const stream = await defaultChatStream();
          yield* stream({ model, messages, maxOutputTokens: ANSWER_MAX_TOKENS });
        },
      }),
  };
}
