// Test doubles the job suites share, so ingest, sync and dream do not grow three
// copies of the same fake model and the same fake bucket.

import type { ModelRunner } from '../model_client.ts';
import { EMBEDDING_DIMENSIONS } from '../models.ts';
import type { UploadStore } from './types.ts';

export interface FakeModel extends ModelRunner {
  embedCalls: string[][];
  completeCalls: { purpose: string; user: string }[];
}

/**
 * Deterministic vectors, so a test can assert which text was embedded without
 * caring what the numbers are. The first component is the text length, which is
 * enough to tell two chunks apart.
 */
export function fakeModel(answers: string[] = []): FakeModel {
  const embedCalls: string[][] = [];
  const completeCalls: { purpose: string; user: string }[] = [];
  const queue = [...answers];

  return {
    embedCalls,
    completeCalls,
    embed({ texts }) {
      embedCalls.push(texts);
      return Promise.resolve(
        texts.map((text) =>
          Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? text.length : 0))
        ),
      );
    },
    complete({ purpose, user }) {
      completeCalls.push({ purpose, user });
      return Promise.resolve(queue.shift() ?? '');
    },
  };
}

export function fakeUploads(files: Record<string, string>): UploadStore {
  return {
    read(storagePath) {
      const contents = files[storagePath];
      if (contents === undefined) {
        return Promise.reject(new Error(`no upload at ${storagePath}`));
      }
      return Promise.resolve(new TextEncoder().encode(contents));
    },
  };
}

/**
 * The lines `run` wrote to console.error.
 *
 * A write a job body is right not to fail over still has to leave a trace, and
 * the log is the only place that trace can be asserted from.
 */
export async function capturedErrors(run: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => lines.push(args.map((arg) => String(arg)).join(' '));
  try {
    await run();
  } finally {
    console.error = original;
  }
  return lines;
}

/** A clock that jumps by a fixed step on every read, for driving the budget. */
export function steppingClock(start: Date, stepMs: number): { now(): Date } {
  let reads = 0;
  return { now: () => new Date(start.getTime() + stepMs * reads++) };
}

/**
 * A clock that stands still for `ticks` readings and then jumps past any budget.
 *
 * A clock that jumps on its second reading always stops a job at its first
 * checkpoint, which is the one checkpoint that proves nothing about the work
 * after it. Walking `ticks` up stops the same job at each checkpoint in turn.
 */
export function jumpingClock(start: Date, ticks: number, jumpMs = 60_000): { now(): Date } {
  let reads = 0;
  return { now: () => new Date(start.getTime() + (++reads > ticks ? jumpMs : 0)) };
}
