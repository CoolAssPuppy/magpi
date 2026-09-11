import type { ReactNode } from 'react';

import { SideNav, type NavItem } from '@/components/app/nav';
import { PageHeader } from '@/components/app/page-header';

const SETTINGS_SECTIONS: readonly NavItem[] = [
  { href: '/settings', label: 'Profile' },
  { href: '/settings/embeddings', label: 'Embeddings' },
  { href: '/settings/mcp', label: 'MCP and API' },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Your account, and how agents reach your work." />

      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <aside className="md:w-44 md:shrink-0">
          <SideNav items={SETTINGS_SECTIONS} label="Settings sections" />
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
