import 'server-only';

import { revalidatePath } from 'next/cache';

import { getSessionContext, type SessionContext } from '@/lib/supabase/context';

import { errorState, NOT_SIGNED_IN, type ActionState } from './state';

/** Runs a server action as the signed-in caller. Never wrap `run` in a try: redirect() throws. */
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
