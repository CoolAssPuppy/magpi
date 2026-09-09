'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/** The Supabase Library block, with the console.error dropped. */
export function useCurrentUserName() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!isActive) return;
        const metadata = data.session?.user.user_metadata;
        setName(metadata?.full_name ?? data.session?.user.email ?? null);
      });
    return () => {
      isActive = false;
    };
  }, []);

  return name;
}
