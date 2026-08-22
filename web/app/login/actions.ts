"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

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
