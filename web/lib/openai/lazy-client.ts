import type OpenAI from 'openai';

/** Imports the `server-only` client at call time, keeping it out of a test's module graph. */
export async function openaiClient(): Promise<OpenAI> {
  const { createOpenAIClient } = await import('./client');
  return createOpenAIClient();
}
