import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';
import { safeNextPath } from '@/lib/safe-next-path';

export const metadata = { title: 'Sign in to Magpi' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <AuthShell
      title="Sign in"
      description="Ask your team's knowledge base a question."
      footer={
        <>
          No account yet?{' '}
          <Link href="/sign-up" className="text-foreground underline underline-offset-4">
            Create one
          </Link>
        </>
      }
    >
      <SignInForm next={safeNextPath(next, '/chat', 'http://placeholder.invalid')} />
    </AuthShell>
  );
}
