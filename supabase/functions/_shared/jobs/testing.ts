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

/** A clock that jumps by a fixed step on every read, for driving the budget. */
export function steppingClock(start: Date, stepMs: number): { now(): Date } {
  let reads = 0;
  return { now: () => new Date(start.getTime() + stepMs * reads++) };
}
