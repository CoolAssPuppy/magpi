import type OpenAI from 'openai';

/**
 * The OpenAI client is `server-only`, and every module that reaches a model is
 * also reachable from a test. Importing it at call time keeps the guard on the
 * API key without dragging it into a test's module graph.
 */
export async function openaiClient(): Promise<OpenAI> {
  const { createOpenAIClient } = await import('./client');
  return createOpenAIClient();
}
