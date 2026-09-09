import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" description="We will email you a link to set a new one.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
