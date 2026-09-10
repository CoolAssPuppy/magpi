import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { safeNextPath } from '@/lib/safe-next-path';
import { createClient } from '@/lib/supabase/server';

/** The six kinds of email link Supabase sends. EmailOtpType is any string, so parse it here. */
const otpTypeSchema = z.enum([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const rawType = searchParams.get('type');
  const next = safeNextPath(searchParams.get('next'), '/chat', origin);

  if (!tokenHash || !rawType) {
    return NextResponse.redirect(`${origin}/auth/error?error=No%20token%20hash%20or%20type`);
  }

  const type = otpTypeSchema.safeParse(rawType);
  if (!type.success) {
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent('That confirmation link is not one we recognize.')}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: type.data, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
