import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { MagpieMark } from '@/components/brand/magpie-mark';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-heading text-base tracking-tight text-foreground"
        >
          <MagpieMark />
          Magpi
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="text-sm text-tertiary-foreground hover:text-foreground">
            Pricing
          </Link>
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="border-t border-border px-5 py-4 text-xs text-tertiary-foreground">
        Magpi is open source under MIT. Built on Supabase.
      </footer>
    </div>
  );
}
