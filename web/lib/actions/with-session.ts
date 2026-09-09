import 'server-only';

import { revalidatePath } from 'next/cache';

import { getSessionContext, type SessionContext } from '@/lib/supabase/context';

import { errorState, NOT_SIGNED_IN, type ActionState } from './state';

/**
 * Runs a server action as the signed-in caller, or answers NOT_SIGNED_IN.
 * revalidatePath runs only on success.
 *
 * Never wrap `run` in a try. redirect() unwinds by throwing, and catching that
 * signal turns a successful action into a stuck form.
 */
export async function withSession<T>(
  run: (context: SessionContext) => Promise<ActionState<T>>,
  revalidate: string,
): Promise<ActionState<T>> {
  const context = await getSessionContext();
  if (!context) return errorState(NOT_SIGNED_IN);

  const result = await run(context);
  if (result.status === 'success') revalidatePath(revalidate);
  return result;
}
