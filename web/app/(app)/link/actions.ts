"use server";

import { z } from "zod";

import { renameBadge, revoke } from "@/lib/actions/badges";
import { errorState, successState, type ActionState } from "@/lib/actions/state";
import { withSession } from "@/lib/actions/with-session";
import { createClient } from "@/lib/supabase/server";

const REVALIDATE = "/link";

export async function renameBadgeAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  return withSession(
    async (context) => renameBadge(await createClient(), context.user.id, form),
    REVALIDATE,
  );
}

export async function revokeBadgeAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  return withSession(
    async (context) => revoke(await createClient(), context.user.id, form),
    REVALIDATE,
  );
}

const approveSchema = z.object({
  // The badge draws the code with a dash, so the field accepts what is on the
  // screen in front of the wearer.
  user_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/, "That code does not look right."),
});

/**
 * Approves a pairing the badge started.
 *
 * The device holds the device code and this side only ever sees the user code,
 * so approving is a claim about a flow already in progress rather than a way
 * to mint a badge from the website.
 */
export async function approveCodeAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = approveSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return errorState("That code does not look right.");

  return withSession(async (context) => {
    const response = await fetch(`${context.apiBaseUrl}/device-approve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${context.accessToken}`,
      },
      body: JSON.stringify({ user_code: parsed.data.user_code.replace("-", "") }),
    });

    if (response.ok) {
      return successState("Paired. The badge picks it up on its next poll.");
    }
    if (response.status === 429) {
      return errorState("Too many tries. Wait a minute and start a new code on the badge.");
    }
    // A wrong code, an expired one, and one already claimed all get the same
    // answer: telling them apart says which codes are real.
    return errorState("That code is not valid. Start a new one on the badge.");
  }, REVALIDATE);
}
