'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const ENTITIES_PATH = '/dreams/entities';

/** The subtab strip for the dreams route. Runs stays selected on a single run's page. */
export function DreamTabs() {
  const pathname = usePathname();
  const isEntities = pathname.startsWith(ENTITIES_PATH);

  const items = [
    { href: '/dreams', label: 'Runs', isActive: !isEntities },
    { href: ENTITIES_PATH, label: 'Entities', isActive: isEntities },
  ] as const;

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Dreams sections">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.isActive ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm transition-colors motion-reduce:transition-none',
            item.isActive
              ? 'border-brand-600 text-foreground'
              : 'border-transparent text-tertiary-foreground hover:text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
