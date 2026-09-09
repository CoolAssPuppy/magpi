import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';

export const metadata = { title: 'Sign in failed' };

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
      <p className="text-sm text-foreground-light">
        {error ?? 'The link was missing the token needed to finish signing in.'}
      </p>
    </AuthShell>
  );
}
