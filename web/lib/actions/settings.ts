import { z } from "zod";

import { MIN_POLL_MS } from "@/lib/badge-constants";
import { MAX_POLL_MS, savePollInterval, savePomodoroSettings, type DbClient } from "@/lib/db";

import { errorState, successState, type ActionState } from "./state";

/**
 * The same bounds the check constraint holds.
 *
 * Written here as well so the wearer gets a sentence rather than a database
 * error, and held there as well so a direct write cannot skip them.
 */
const pomodoroSchema = z.object({
  work_min: z.coerce.number().int().min(1).max(120),
  short_min: z.coerce.number().int().min(1).max(60),
  long_min: z.coerce.number().int().min(1).max(120),
  sessions: z.coerce.number().int().min(2).max(8),
  leds: z.stringbool().catch(false),
});

const pollSchema = z.object({
  poll_interval_ms: z.coerce.number().int().min(MIN_POLL_MS).max(MAX_POLL_MS),
});

const SAVE_FAILED = "That did not save. Try again.";

export async function savePomodoro(
  client: DbClient,
  userId: string,
  form: FormData,
): Promise<ActionState> {
  const parsed = pomodoroSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return errorState(pomodoroMessage(parsed.error));

  const result = await savePomodoroSettings(client, userId, parsed.data);
  if (!result.ok) return errorState(SAVE_FAILED);
  // Notifier carries these to the badge on its next poll, so the change is
  // not instant and the copy says so rather than implying it is.
  return successState("Saved. Your badge picks these up on its next poll.");
}

export async function savePolling(
  client: DbClient,
  userId: string,
  form: FormData,
): Promise<ActionState> {
  const parsed = pollSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return errorState(
      `Choose between ${MIN_POLL_MS / 1000} seconds and ${MAX_POLL_MS / 60000} minutes.`,
    );
  }

  const result = await savePollInterval(client, userId, parsed.data.poll_interval_ms);
  if (!result.ok) return errorState(SAVE_FAILED);
  return successState("Saved.");
}

/** Names the field that was wrong, because four numbers share one form. */
function pomodoroMessage(error: z.ZodError): string {
  const field = error.issues[0]?.path[0];
  const labels: Record<string, string> = {
    work_min: "A pomodoro is between 1 and 120 minutes.",
    short_min: "A short break is between 1 and 60 minutes.",
    long_min: "A long break is between 1 and 120 minutes.",
    sessions: "A set is between 2 and 8 pomodoros.",
  };
  return (typeof field === "string" ? labels[field] : undefined) ?? "Check those numbers.";
}
