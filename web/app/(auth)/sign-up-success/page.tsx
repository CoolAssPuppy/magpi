import { AuthShell } from '@/components/auth/auth-shell';

export const metadata = { title: 'Confirm your email' };

export default function SignUpSuccessPage() {
  return (
    <AuthShell title="Check your email" description="Your account is waiting on one click.">
      <p className="text-sm text-foreground-light">
        We sent you a confirmation link. Open it and you land straight in chat.
      </p>
    </AuthShell>
  );
}
