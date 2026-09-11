// Where a GitHub pass resumes. One connection reads several repositories, so one stamp will not do.

import { asRecord, asString } from './common.ts';

/** A first read of one repository, part way through its tree. */
export interface Walk {
  repo: string;
  /** The commit the tree is read at, so a push mid-walk does not shuffle the pages. */
  head: string;
  /** When that commit landed, which is what every file in this walk is dated by. */
  stamp: string;
  /** The last path already filed. Empty at the start of a walk. */
  after: string;
}

export interface Position {
  /** The commit each repository has been read up to. An empty string is a repository with none. */
  heads: Record<string, string>;
  walk: Walk | null;
  /** Which repository the next incremental round starts at, so a long list is read in turn. */
  resume: string;
}

const EMPTY: Position = { heads: {}, walk: null, resume: '' };

function walkFrom(value: unknown): Walk | null {
  const record = asRecord(value);
  const repo = asString(record.repo);
  const head = asString(record.head);
  if (repo.length === 0 || head.length === 0) return null;

  return { repo, head, stamp: asString(record.stamp), after: asString(record.after) };
}

function headsFrom(value: unknown): Record<string, string> {
  const heads: Record<string, string> = {};
  for (const [repo, sha] of Object.entries(asRecord(value))) {
    if (typeof sha === 'string') heads[repo] = sha;
  }
  return heads;
}

/** An unreadable cursor reads every repository again rather than failing the connection. */
export function parsePosition(value: string | null): Position {
  const raw = asString(value);
  if (!raw.startsWith('{')) return EMPTY;

  let decoded: unknown = null;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return EMPTY;
  }

  const record = asRecord(decoded);
  return {
    heads: headsFrom(record.heads),
    walk: walkFrom(record.walk),
    resume: asString(record.resume),
  };
}

export function encodePosition(position: Position): string {
  return JSON.stringify(position);
}
