/**
 * Errors are values at API boundaries and thrown inside. A server action returns
 * one of these; the code behind it throws.
 */
export type Result<T, E = string> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: E };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
