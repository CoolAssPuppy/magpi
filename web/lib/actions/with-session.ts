import "server-only";

import { revalidatePath } from "next/cache";

import { getSessionContext, type SessionContext } from "@/lib/supabase/context";

import { errorState, NOT_SIGNED_IN, type ActionState } from "./state";

/**
 * Run a server action as the signed-in caller, or answer NOT_SIGNED_IN.
 * `revalidate` runs only when the action succeeded.
 *
 * Without a revalidate path the page is stale after the mutation and the user
 * refreshes by hand. That is the single most repeated mistake in this kind of
 * app, so the parameter is not optional in practice: every caller passes one.
 *
 * Never wrap `run` in a try. `redirect()` unwinds by throwing, and catching
 * that signal turns a successful action into a stuck form.
 */
export async function withSession(
  run: (context: SessionContext) => Promise<ActionState>,
  revalidate: string,
): Promise<ActionState> {
  const context = await getSessionContext();
  if (!context) return errorState(NOT_SIGNED_IN);

  const result = await run(context);
  if (result.status === "success") revalidatePath(revalidate);
  return result;
}
