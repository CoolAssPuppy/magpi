import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * shadcn's Input on the Supabase tokens. The focus border steps up to
 * --border-control-hover, which is the stroke upstream reserves for control
 * chrome, so a focused field reads as focused without a second ring color.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-panel border border-input bg-accent px-3 py-2 text-sm',
        'text-foreground placeholder:text-tertiary-foreground',
        'focus-visible:border-control-hover focus-visible:ring-1 focus-visible:ring-input focus-visible:outline-none',
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
