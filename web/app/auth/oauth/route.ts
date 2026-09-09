import { NextResponse, type NextRequest } from 'next/server';

import { safeNextPath } from '@/lib/safe-next-path';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'), '/chat', origin);

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?error=No%20authorization%20code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Behind a load balancer the origin is the balancer's, not the user's, so the
  // forwarded host is the one to redirect to. Locally there is nothing in
  // between and the header is absent.
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (process.env.NODE_ENV !== 'development' && forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
