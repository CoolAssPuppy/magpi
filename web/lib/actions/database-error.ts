import { errorState, type ActionState } from './state';

/**
 * The three fields of a PostgrestError this reads. Narrow rather than the class
 * itself, so a caller's test can hand it a refusal without constructing one.
 */
export type DatabaseError = {
  readonly code: string;
  readonly message: string;
  readonly details: string;
};

/**
 * Product copy for a database refusal, with the raw error kept server-side.
 *
 * A PostgrestError message is written for whoever wrote the schema. Eleven
 * action paths returned it straight to the screen, so a policy denial rendered
 * as `new row violates row-level security policy for table "conversations"`.
 * That names a table, tells the reader nothing they can do about it, and
 * describes the permission model to anyone probing it.
 */
export function databaseErrorState(
  context: string,
  error: DatabaseError,
  copy: { readonly fallback: string; readonly byCode?: Readonly<Record<string, string>> },
): ActionState<never> {
  console.error(context, { code: error.code, message: error.message, details: error.details });
  return errorState(copy.byCode?.[error.code] ?? copy.fallback);
}
