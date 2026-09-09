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
      title="That did not work"
      description="Sign in failed before a session was created."
      footer={
        <Link href="/sign-in" className="text-foreground underline underline-offset-4">
          Try again
        </Link>
      }
    >
      <p className="text-sm text-foreground-light">{signInFailureCopy({ error, errorCode })}</p>
    </AuthShell>
  );
}
