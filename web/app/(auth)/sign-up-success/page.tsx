import { AuthShell } from '@/components/auth/auth-shell';

export const metadata = { title: 'Confirm your email' };

export default function SignUpSuccessPage() {
  return (
    <AuthShell
      title="Check your email"
      description="Open the link we sent to confirm your account."
    >
      <p className="text-sm text-muted-foreground">
        We sent you a confirmation link. Open it and you land straight in chat.
      </p>
    </AuthShell>
  );
}
