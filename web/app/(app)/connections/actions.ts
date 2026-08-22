"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { disconnect } from "@/lib/actions/badges";
import { errorState, type ActionState } from "@/lib/actions/state";
import { withSession } from "@/lib/actions/with-session";
import { createClient } from "@/lib/supabase/server";

const REVALIDATE = "/connections";

const beginSchema = z.object({ provider: z.string().regex(/^[a-z][a-z0-9_]*$/) });

const keySchema = z.object({
  provider: z.string().regex(/^[a-z][a-z0-9_]*$/),
  api_key: z.string().trim().min(8).max(500),
  host: z.string().trim().max(200).optional(),
  project_id: z.string().trim().max(64).optional(),
  insight_id: z.string().trim().max(64).optional(),
  team_id: z.string().trim().max(64).optional(),
});

/**
 * Starts an OAuth flow.
 *
 * The gateway builds the authorize URL and parks the PKCE verifier, because
 * the verifier must never round-trip through a browser: one that does is one
 * the browser can substitute.
 */
export async function beginOAuthAction(form: FormData): Promise<void> {
  const parsed = beginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/connections?error=unknown_provider");

  const context = await withSessionContext();
  if (!context) redirect("/?next=/connections");

  const response = await fetch(`${context.apiBaseUrl}/connections-begin`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${context.accessToken}`,
    },
    body: JSON.stringify({ provider: parsed.data.provider, return_to: "/connections" }),
  });

  if (!response.ok) redirect("/connections?error=begin");

  const body: unknown = await response.json();
  const url = typeof body === "object" && body !== null ? (body as { url?: unknown }).url : null;
  if (typeof url !== "string") redirect("/connections?error=begin");

  redirect(url);
}

/**
 * Saves an API key.
 *
 * The key goes to the gateway rather than straight to the table, because it
 * has to be encrypted before it is stored and the encryption key reaches the
 * edge functions and nothing else. The web app never holds one.
 */
export async function saveApiKeyAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = keySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return errorState("Paste the whole key, then try again.");

  return withSession(async (context) => {
    const { provider, api_key: apiKey, ...meta } = parsed.data;
    const response = await fetch(`${context.apiBaseUrl}/connections-claim`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${context.accessToken}`,
      },
      body: JSON.stringify({
        provider,
        api_key: apiKey,
        meta: Object.fromEntries(Object.entries(meta).filter(([, value]) => value)),
      }),
    });

    if (response.ok) {
      return { status: "success", message: "Saved and tested." } as const;
    }
    // The provider's own words, when the gateway passed them on. A key that
    // was rejected is worth saying so about; anything else is not.
    const detail = await readMessage(response);
    return errorState(detail ?? "That key was not accepted. Check it and try again.");
  }, REVALIDATE);
}

export async function disconnectAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  return withSession(
    async (context) => disconnect(await createClient(), context.user.id, form),
    REVALIDATE,
  );
}

async function readMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const message = (body as { error?: { message?: unknown } }).error?.message;
    return typeof message === "string" ? message : null;
  } catch {
    return null;
  }
}

async function withSessionContext() {
  const { getSessionContext } = await import("@/lib/supabase/context");
  return getSessionContext();
}
