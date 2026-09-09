// What every dream kind is handed, and the few helpers more than one of them needs.
//
// This lives below dream.ts rather than inside it so the three kind files can
// import the context without importing the module that dispatches to them. A
// cycle here would resolve at runtime and still be a trap for the next reader.

import { z } from 'zod';

import { ApiError } from '../errors.ts';
import type { Budget } from './budget.ts';
import type { SpaceChunkRow, SpaceScopedDb } from './space_writer.ts';
import type { JobDeps } from './types.ts';

export interface DreamRunRecord {
  id: string;
  org_id: string;
  space_id: string;
  kind: 'entities' | 'digest' | 'connections';
}

/** What a finished pass produced, and what the run row records about it. */
export interface DreamOutcome {
  inputDocumentCount: number;
  outputDocumentId: string | null;
  produced: number;
}

/**
 * The four stages a run can die in.
 *
 * The web client parses dream_runs.error as "<stage>: <message>" and knows only
 * these four words, so a fifth stage name is a row it cannot read.
 */
export type DreamStage = 'collect' | 'extract' | 'synthesize' | 'write';

/** The five things every phase needs, so no phase grows a sixth. */
export interface Pass {
  run: DreamRunRecord;
  deps: JobDeps;
  db: SpaceScopedDb;
  budget: Budget;
  /**
   * Where the pass is now.
   *
   * A timeout carries its own stage. A failure does not, and dream_runs has no
   * stage column to look it up in, so the pass has to leave a trail as it goes
   * or the run row cannot say where the work stopped.
   */
  stage: DreamStage;
}

/** Enter a stage: leave the trail, then check the clock. */
export function enter(pass: Pass, stage: DreamStage): void {
  pass.stage = stage;
  pass.budget.checkpoint(stage);
}

/**
 * How far back a run reads.
 *
 * Runs are scheduled nightly, so one day covers everything that arrived since
 * the last one. A wider window re-summarises what yesterday already summarised
 * and pays the model again for the same content.
 */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** About one model call's worth of space content. */
export const MAX_INPUT_CHUNKS = 120;

export const NOTHING: DreamOutcome = {
  inputDocumentCount: 0,
  outputDocumentId: null,
  produced: 0,
};

export function sinceIso(deps: JobDeps): string {
  return new Date(deps.http.now().getTime() - LOOKBACK_MS).toISOString();
}

/** Every completion a dream makes is one purpose, so the purpose is not a parameter. */
export function ask(
  pass: Pass,
  system: string,
  user: string,
  maxOutputTokens: number,
): Promise<string> {
  const { deps, run } = pass;
  return deps.models.complete({
    orgId: run.org_id,
    purpose: 'dream',
    system,
    user,
    maxOutputTokens,
  });
}

/**
 * A model answer is untrusted input like any other: parsed at the boundary,
 * trusted after. An answer that will not parse is a failed run with a sentence a
 * person can act on, never a crash part way through writing.
 */
export function parsed<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  console.error('a dream answer could not be read', what, result.error.message);
  throw new ApiError(502, 'model_answer_unreadable', `the ${what} the model returned was unusable`);
}

/** Models wrap JSON in a fence however firmly the prompt asks them not to. */
export function readAnswer<T>(schema: z.ZodType<T>, answer: string, what: string): T {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(answer);
  const text = (fenced ? fenced[1] : answer).trim();
  try {
    return parsed(schema, JSON.parse(text), what);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      502,
      'model_answer_unreadable',
      `the ${what} the model returned was not JSON`,
    );
  }
}

export function documentCount(chunks: SpaceChunkRow[]): number {
  return new Set(chunks.map((chunk) => chunk.document_id)).size;
}

/** Chunks handed to the model with the ids it must cite them by. */
export function chunkPrompt(chunks: SpaceChunkRow[]): string {
  return chunks.map((chunk) => `[${chunk.id}]\n${chunk.content}`).join('\n\n');
}
