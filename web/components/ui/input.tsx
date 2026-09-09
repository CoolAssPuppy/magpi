import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * shadcn's Input on the Supabase tokens. The placeholder uses
 * --color-foreground-lighter rather than a muted grey, so it clears 4.5:1
 * against the field background in all three themes.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'border-border-control bg-control flex h-9 w-full rounded-[var(--radius-panel)] border px-3 py-2 text-sm',
        'text-foreground placeholder:text-foreground-lighter',
        'focus-visible:border-border-stronger focus-visible:ring-border-strong focus-visible:ring-1 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
