'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { safeNextPath } from '@/lib/safe-next-path';
import { createClient } from '@/lib/supabase/client';

import { FormError } from './form-error';

const DEMO_PASSWORD = 'supabasedemo';

/**
 * Three of the seven seeded accounts, chosen so one question separates them. Jane sees every
 * space. John holds the cost and not the launch date. Maya holds the launch date and not the cost.
 */
const ACCOUNTS = [
  { label: 'Log in as CEO', email: 'jane@example.com' },
  { label: 'Log in as Finance', email: 'john@example.com' },
  { label: 'Log in as Marketing', email: 'maya@example.com' },
] as const;

export function DemoSignIn({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  async function signIn(email: string) {
    setPendingEmail(email);
    setError(null);

    const { error: signInError } = await createClient().auth.signInWithPassword({
      email,
      password: DEMO_PASSWORD,
    });

    if (signInError) {
      setError(`${signInError.message}. Run scripts/seed-demo.mjs to create the demo accounts.`);
      setPendingEmail(null);
      return;
    }

    window.location.assign(safeNextPath(next, '/chat'));
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <FormError message={error} />

      {ACCOUNTS.map((account) => (
        <Button
          key={account.email}
          type="button"
          disabled={pendingEmail !== null}
          onClick={() => void signIn(account.email)}
          className="w-full bg-demo text-demo-foreground hover:bg-demo/90"
        >
          {account.label}
        </Button>
      ))}
    </div>
  );
}
