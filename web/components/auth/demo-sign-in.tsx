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
  { label: 'Log in as CEO', email: 'jane@example.com', who: 'Jane, in every space' },
  { label: 'Log in as Finance', email: 'john@example.com', who: 'John, no Marketing' },
  { label: 'Log in as Marketing', email: 'maya@example.com', who: 'Maya, no Finance' },
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
    <div className="flex flex-col gap-2">
      <FormError message={error} />

      {ACCOUNTS.map((account) => (
        <Button
          key={account.email}
          type="button"
          disabled={pendingEmail !== null}
          onClick={() => void signIn(account.email)}
          className="bg-demo text-demo-foreground hover:bg-demo/90 w-full justify-between"
        >
          <span>{account.label}</span>
          <span className="text-xs opacity-80">{account.who}</span>
        </Button>
      ))}

      <p className="text-center text-xs text-tertiary-foreground">
        Demo accounts. Ask each of them what the Fold S1 costs and when it launches.
      </p>
    </div>
  );
}
