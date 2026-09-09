import 'server-only';

import OpenAI from 'openai';

import { serverEnv } from '@/lib/env';

/**
 * Constructed per call rather than hoisted to module scope. On Fluid compute a
 * module-scope client outlives the request that made it.
 */
export function createOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: serverEnv().OPENAI_API_KEY });
}
