import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';
import { safeNextPath } from '@/lib/safe-next-path';

const PUBLIC_PREFIXES = ['/sign-in', '/sign-up', '/auth', '/pricing', '/api/stripe'] as const;

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims verifies the JWT locally rather than calling the auth server on
  // every request. getSession alone trusts whatever is in the cookie.
  const { data } = await supabase.auth.getClaims();
  const isPublic =
    request.nextUrl.pathname === '/' ||
    PUBLIC_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', safeNextPath(request.nextUrl.pathname));
    return NextResponse.redirect(url);
  }

  return response;
}
