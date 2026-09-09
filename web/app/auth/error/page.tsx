import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';

import { signInFailureCopy } from './messages';

export const metadata = { title: 'Sign in failed' };

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_code?: string }>;
}) {
  const { error, error_code: errorCode } = await searchParams;

  return (
    <AuthShell
      title="Sign in failed"
      footer={
        <Link href="/sign-in" className="text-foreground underline underline-offset-4">
          Try again
        </Link>
      }
    >
      <p className="text-sm text-muted-foreground">{signInFailureCopy({ error, errorCode })}</p>
    </AuthShell>
  );
}
