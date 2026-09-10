import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** One row of the shell, held to `--measure-shell` and centred. */
export function ShellRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('mx-auto w-full max-w-[var(--measure-shell)] px-5', className)}>
      {children}
    </div>
  );
}
