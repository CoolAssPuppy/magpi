import { NextResponse, type NextRequest } from "next/server";

import { landingPath, safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

/** The OAuth and magic link landing point. A route handler, because the provider GETs. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=exchange`);

  // An account with no badge has nothing to configure yet, so pairing comes
  // first. A count, not the rows: nothing here reads them.
  const { count } = await supabase
    .from("badges")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);

  return NextResponse.redirect(`${origin}${landingPath(next, (count ?? 0) > 0)}`);
}
