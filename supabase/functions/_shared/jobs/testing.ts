// Test doubles shared by the ingest, sync and dream job suites.

import type { ModelRunner } from '../model_client.ts';
import { EMBEDDING_DIMENSIONS } from '../models.ts';
import type { UploadStore } from './types.ts';

export interface FakeModel extends ModelRunner {
  embedCalls: string[][];
  completeCalls: { purpose: string; user: string }[];
}

/** Deterministic vectors whose first component is the text length, so chunks can be told apart. */
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

/** The lines `run` wrote to console.error. */
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

/** A clock that stands still for `ticks` readings, then jumps past any budget after that. */
export function jumpingClock(start: Date, ticks: number, jumpMs = 60_000): { now(): Date } {
  let reads = 0;
  return { now: () => new Date(start.getTime() + (++reads > ticks ? jumpMs : 0)) };
}
