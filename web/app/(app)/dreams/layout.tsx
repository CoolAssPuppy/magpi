import type { ReactNode } from 'react';

import { PageHeader } from '@/components/app/page-header';
import { DreamTabs } from '@/components/dreams/dream-tabs';
import { DREAM_DEFINITION } from '@/lib/dreams/status';

/**
 * The word is defined here, once, on the first screen it appears on. Everything
 * below uses it without apology.
 */
export default function DreamsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Dreams" description={DREAM_DEFINITION} />
      <DreamTabs />
      {children}
    </>
  );
}
