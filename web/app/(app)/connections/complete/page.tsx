import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/supabase/context";

/**
 * The last step of an OAuth connect.
 *
 * The provider sends the browser to the gateway, which cannot read the session
 * cookie because it is on another origin. So it parks the tokens against a
 * one-use ticket and sends the browser here, where the cookie exists. This
 * exchanges that ticket as the signed-in user, which is what binds the
 * connection to an account.
 *
 * A ticket is single use. Refreshing this page is a second claim on a spent
 * one, which is why a failure says so rather than retrying.
 */
export default async function CompleteConnectionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ticket = typeof params.ticket === "string" ? params.ticket : null;
  if (!ticket) redirect("/connections?error=no_ticket");

  const context = await getSessionContext();
  if (!context) redirect("/?next=/connections");

  const response = await fetch(`${context.apiBaseUrl}/connections-claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${context.accessToken}`,
    },
    body: JSON.stringify({ ticket }),
    cache: "no-store",
  });

  // Never the gateway's own words: a claim that failed says the same thing
  // whether the ticket was wrong, expired, or already spent, because telling
  // them apart says which tickets were real.
  redirect(response.ok ? "/connections?connected=1" : "/connections?error=claim");
}
