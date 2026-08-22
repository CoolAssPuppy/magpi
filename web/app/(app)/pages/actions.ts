"use server";

import { configurePage, reorderPages, togglePage } from "@/lib/actions/pages";
import { withSession } from "@/lib/actions/with-session";
import type { ActionState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/server";

const REVALIDATE = "/pages";

/**
 * The thin wrappers. Each passes a revalidate path, without which the page is
 * stale after the mutation and the user refreshes by hand.
 */

export async function togglePageAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  return withSession(
    async (context) => togglePage(await createClient(), context.user.id, form),
    REVALIDATE,
  );
}

export async function reorderPagesAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  return withSession(
    async (context) => reorderPages(await createClient(), context.user.id, form),
    REVALIDATE,
  );
}

export async function configurePageAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  return withSession(
    async (context) => configurePage(await createClient(), context.user.id, form),
    REVALIDATE,
  );
}
