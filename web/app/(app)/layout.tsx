import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Nav, type NavItem } from '@/components/app/nav';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { CurrentUserAvatar } from '@/components/current-user-avatar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { getSessionContext } from '@/lib/supabase/context';

const BASE_ITEMS: readonly NavItem[] = [
  { href: '/chat', label: 'Chat' },
  { href: '/spaces', label: 'Spaces' },
  { href: '/documents', label: 'Documents' },
  { href: '/connections', label: 'Connections' },
  { href: '/dreams', label: 'Dreams' },
];

const ADMIN_ITEM: NavItem = { href: '/admin', label: 'Admin' };

export default async function AppLayout({ children }: { children: ReactNode }) {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const items =
    context.role === 'owner' || context.role === 'admin'
      ? [...BASE_ITEMS, ADMIN_ITEM]
      : BASE_ITEMS;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-3">
        <Link href="/chat" className="font-heading text-foreground text-base tracking-tight">
          Recall
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/settings"
            className="text-foreground-lighter hover:text-foreground text-sm"
          >
            Settings
          </Link>
          <SignOutButton />
          <CurrentUserAvatar />
        </div>
      </header>

      <div className="px-5">
        <Nav items={items} />
      </div>

      <main className="flex flex-1 flex-col gap-6 px-5 py-6">{children}</main>
    </div>
  );
}
