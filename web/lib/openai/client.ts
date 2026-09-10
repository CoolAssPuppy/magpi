import 'server-only';

import OpenAI from 'openai';

import { serverEnv } from '@/lib/env';

/** Constructed per call: on Fluid compute a module-scope client outlives its request. */
export function createOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: serverEnv().OPENAI_API_KEY });
}
