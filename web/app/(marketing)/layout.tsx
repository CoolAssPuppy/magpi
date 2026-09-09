import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-3">
        <Link href="/" className="font-heading text-foreground text-base tracking-tight">
          Recall
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="text-foreground-lighter hover:text-foreground text-sm">
            Pricing
          </Link>
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="border-border text-foreground-lighter border-t px-5 py-4 text-xs">
        Recall is open source under MIT. Built on Supabase.
      </footer>
    </div>
  );
}
