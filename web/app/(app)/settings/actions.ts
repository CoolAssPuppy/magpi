"use server";

import type { ActionState } from "@/lib/actions/state";
import { savePolling, savePomodoro } from "@/lib/actions/settings";
import { withSession } from "@/lib/actions/with-session";
import { createClient } from "@/lib/supabase/server";

const REVALIDATE = "/settings";

export async function savePomodoroAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  return withSession(
    async (context) => savePomodoro(await createClient(), context.user.id, form),
    REVALIDATE,
  );
}

export async function savePollingAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  return withSession(
    async (context) => savePolling(await createClient(), context.user.id, form),
    REVALIDATE,
  );
}
