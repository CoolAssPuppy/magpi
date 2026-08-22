import { z } from "zod";

import { disconnectConnection, relabelBadge, revokeBadge, type DbClient } from "@/lib/db";

import { errorState, successState, type ActionState } from "./state";

const relabelSchema = z.object({
  badge_id: z.uuid(),
  // Long enough to tell two badges apart, short enough for the list row.
  label: z.string().trim().min(1).max(40),
});

const revokeSchema = z.object({ badge_id: z.uuid() });

const disconnectSchema = z.object({
  connection_id: z.uuid(),
});

const SAVE_FAILED = "That did not save. Try again.";

export async function renameBadge(
  client: DbClient,
  userId: string,
  form: FormData,
): Promise<ActionState> {
  const parsed = relabelSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return errorState("Give the badge a name between 1 and 40 characters.");

  const result = await relabelBadge(client, userId, parsed.data.badge_id, parsed.data.label);
  if (!result.ok) return errorState(SAVE_FAILED);
  return successState("Renamed.");
}

/**
 * Revoking writes revoked_at and nothing else.
 *
 * The row stays, so the pairing history survives and the hardware uid stops
 * blocking a re-pair. The token dies on the badge's next gateway call, which
 * is when the badge finds out and opens pairing on its own.
 */
export async function revoke(
  client: DbClient,
  userId: string,
  form: FormData,
): Promise<ActionState> {
  const parsed = revokeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return errorState("That badge is not yours to revoke.");

  const result = await revokeBadge(client, userId, parsed.data.badge_id);
  if (!result.ok) return errorState(SAVE_FAILED);
  return successState("Revoked. The badge will ask to pair again.");
}

/**
 * Deleting the row is the disconnect.
 *
 * There is no update path for a client on this table, so a delete is the only
 * thing a user can do to a connection, and it takes the ciphertext with it.
 */
export async function disconnect(
  client: DbClient,
  userId: string,
  form: FormData,
): Promise<ActionState> {
  const parsed = disconnectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return errorState("That is not a connection.");

  const result = await disconnectConnection(client, userId, parsed.data.connection_id);
  if (!result.ok) return errorState(SAVE_FAILED);
  return successState("Removed.");
}
