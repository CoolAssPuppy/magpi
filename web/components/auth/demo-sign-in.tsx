'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { safeNextPath } from '@/lib/safe-next-path';
import { createClient } from '@/lib/supabase/client';

import { FormError } from './form-error';

/** The demo account from supabase/corpus/COMPANY.md, seeded by scripts/seed-demo.mjs. */
const DEMO_EMAIL = 'jane@example.com';
const DEMO_PASSWORD = 'supabasedemo';

/**
 * Signs in as the seeded demo CEO. Rendered only where SB_DEMO_LOGIN is on, and coloured off the
 * product palette so nobody mistakes it for a way real people get in.
 */
export function DemoSignIn({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function signIn() {
    setIsPending(true);
    setError(null);

    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });

    if (signInError) {
      setError(`${signInError.message}. Run scripts/seed-demo.mjs to create the demo accounts.`);
      setIsPending(false);
      return;
    }

    window.location.assign(safeNextPath(next, '/chat'));
  }

  return (
    <div className="flex flex-col gap-2">
      <FormError message={error} />

      <Button
        type="button"
        disabled={isPending}
        onClick={signIn}
        className="bg-demo text-demo-foreground hover:bg-demo/90 w-full"
      >
        Log in as Jane
      </Button>

      <p className="text-center text-xs text-tertiary-foreground">
        Demo account. Jane is in every space, so she can answer anything.
      </p>
    </div>
  );
}
