// Assertions the suites share, so no test file grows its own copy.

import { ApiError } from "../errors.ts";

/** The ApiError a call throws, or a failure naming what came out instead. */
export function apiErrorFrom(run: () => unknown): ApiError {
  try {
    run();
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw new Error(`expected an ApiError, got ${String(err)}`);
  }
  throw new Error("expected an ApiError, the call returned");
}

export async function asyncApiErrorFrom(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw new Error(`expected an ApiError, got ${String(err)}`);
  }
  throw new Error("expected an ApiError, the call returned");
}

/** Env values a test names explicitly, instead of mutating the process environment. */
export function envSource(values: Record<string, string>): { get(name: string): string | undefined } {
  return { get: (name: string) => values[name] };
}
