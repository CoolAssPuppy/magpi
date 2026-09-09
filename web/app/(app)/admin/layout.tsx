import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ErrorState } from '@/components/app/error-state';
import { Nav, type NavItem } from '@/components/app/nav';
import { PageHeader } from '@/components/app/page-header';
import { resolveAdminAccess } from '@/lib/analytics/access';

const ADMIN_TABS: readonly NavItem[] = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/billing', label: 'Billing' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await resolveAdminAccess();

  if (access.kind === 'signed-out') redirect('/sign-in');

  if (access.kind === 'forbidden') {
    return (
      <>
        <PageHeader title="Admin" />
        <ErrorState
          title="You do not have access to this"
          detail="Admin analytics, members and billing are open to owners and admins. Ask one of them to change your role if you need to see this."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Admin"
        description="Whether the brain is working, who is in the organization, and what it costs."
      />
      <Nav items={ADMIN_TABS} />
      {children}
    </>
  );
}
