"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { errorState, successState, type ActionState } from "@/lib/actions/state";
import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.email();

async function callbackUrl(next: string): Promise<string> {
  // The origin comes from the request rather than an env var, so the same
  // build works on localhost, a preview URL, and the real domain.
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost";
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${protocol}://${host}/auth/callback?next=${encodeURIComponent(next)}`;
}

/** GitHub first, because it is one click and most people signing in have one. */
export async function signInWithGitHub(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: await callbackUrl(next) },
  });

  if (error || !data.url) redirect("/login?error=github");
  redirect(data.url);
}

/** The magic link, for anyone without a GitHub account. */
export async function sendMagicLink(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return errorState("That does not look like an email address.");

  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(next) },
  });

  // The same answer either way. Saying an address is unknown tells a stranger
  // which addresses have accounts.
  if (error) return errorState("The link could not be sent. Try again in a moment.");
  return successState(`Check ${parsed.data} for a link.`);
}
