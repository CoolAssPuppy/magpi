import { AuthShell } from '@/components/auth/auth-shell';
import { UpdatePasswordForm } from '@/components/auth/update-password-form';

export const metadata = { title: 'Set a new password' };

export default function UpdatePasswordPage() {
  return (
    <AuthShell title="Set a new password" description="Six characters or more.">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
