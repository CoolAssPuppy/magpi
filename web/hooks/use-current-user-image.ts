'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/** The Supabase Library block, with the console.error dropped. */
export function useCurrentUserImage() {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!isActive) return;
        setImage(data.session?.user.user_metadata.avatar_url ?? null);
      });
    return () => {
      isActive = false;
    };
  }, []);

  return image;
}
