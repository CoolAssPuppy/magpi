'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export type NavItem = { readonly href: string; readonly label: string };

const covers = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

/** The longest match wins, so /admin does not stay lit on /admin/members. */
function currentHref(pathname: string, items: readonly NavItem[]): string | null {
  const matches = items.filter((item) => covers(pathname, item.href));
  if (matches.length === 0) return null;

  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).href;
}

const LINK_BASE =
  'rounded-[var(--radius-panel)] px-2.5 py-1.5 text-sm transition-colors motion-reduce:transition-none';
const LINK_ACTIVE = 'bg-muted font-medium text-foreground';
const LINK_IDLE = 'text-tertiary-foreground hover:bg-muted hover:text-foreground';

function NavLinks({ items, pathname }: { items: readonly NavItem[]; pathname: string }) {
  const current = currentHref(pathname, items);

  return items.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={item.href === current ? 'page' : undefined}
      className={cn(LINK_BASE, item.href === current ? LINK_ACTIVE : LINK_IDLE)}
    >
      {item.label}
    </Link>
  ));
}

/** The section links in the header. They sit outside every asynchronous content state below. */
export function Nav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5" aria-label="Sections">
      <NavLinks items={items} pathname={pathname} />
    </nav>
  );
}

/** The same links stacked, for a section that carries its own sub-navigation. */
export function SideNav({ items, label }: { items: readonly NavItem[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-row gap-0.5 overflow-x-auto md:flex-col md:overflow-visible"
      aria-label={label}
    >
      <NavLinks items={items} pathname={pathname} />
    </nav>
  );
}
