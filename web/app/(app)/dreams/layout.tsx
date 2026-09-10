import type { ReactNode } from 'react';

import { PageHeader } from '@/components/app/page-header';
import { DreamTabs } from '@/components/dreams/dream-tabs';
import { DREAM_DEFINITION } from '@/lib/dreams/status';

/** Defines the word "dream" once, in the header above every dreams screen. */
export default function DreamsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Dreams" description={DREAM_DEFINITION} />
      <DreamTabs />
      {children}
    </>
  );
}
