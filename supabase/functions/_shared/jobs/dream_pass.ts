// Shared context and helpers for the dream passes, kept out of dream.ts to avoid an import cycle.

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

/** Stages a run can die in. The web client parses dream_runs.error as "<stage>: <message>". */
export type DreamStage = 'collect' | 'extract' | 'synthesize' | 'write';

/** The five things every phase needs, so no phase grows a sixth. */
export interface Pass {
  run: DreamRunRecord;
  deps: JobDeps;
  db: SpaceScopedDb;
  budget: Budget;
  /** Where the pass is now, so a failed run row can report where the work stopped. */
  stage: DreamStage;
  /** How many documents the pass had read when it stopped, including on a timeout. */
  inputDocumentCount: number;
}

/** Records what the pass has read, so a terminal row can report it. */
export function counted(pass: Pass, chunks: SpaceChunkRow[]): SpaceChunkRow[] {
  pass.inputDocumentCount = documentCount(chunks);
  return chunks;
}

/** Enter a stage: leave the trail, then check the clock. */
export function enter(pass: Pass, stage: DreamStage): void {
  pass.stage = stage;
  pass.budget.checkpoint(stage);
}

/** How far back a run reads. One day covers everything since the nightly run before it. */
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
  json = false,
): Promise<string> {
  const { deps, run } = pass;
  return deps.models.complete({
    orgId: run.org_id,
    purpose: 'dream',
    system,
    user,
    maxOutputTokens,
    json,
  });
}

/** Parses a model answer at the boundary, turning an unreadable one into a 502. */
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
