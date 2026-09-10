import { errorState, type ActionState } from './state';

/** The three fields of a PostgrestError this reads, narrowed so a test can hand it a refusal. */
export type DatabaseError = {
  readonly code: string;
  readonly message: string;
  readonly details: string;
};

/** Product copy for a database refusal, with the raw error logged server-side only. */
export function databaseErrorState(
  context: string,
  error: DatabaseError,
  copy: { readonly fallback: string; readonly byCode?: Readonly<Record<string, string>> },
): ActionState<never> {
  console.error(context, { code: error.code, message: error.message, details: error.details });
  return errorState(copy.byCode?.[error.code] ?? copy.fallback);
}
