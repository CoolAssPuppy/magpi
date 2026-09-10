'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export type NavItem = { readonly href: string; readonly label: string };

/** The persistent tab strip, rendered outside every loading, empty and error state below it. */
export function Nav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Sections">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors motion-reduce:transition-none',
              isActive
                ? 'border-brand-600 text-foreground'
                : 'border-transparent text-tertiary-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
