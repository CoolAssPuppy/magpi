import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * shadcn's Button, rewritten onto the Supabase semantic tokens. Radii come from
 * --radius-panel, colors from --color-brand-* and the semantic surface scale, and
 * there is no shadow paired with a border on the same element.
 *
 * The muted fill is written as bg-(--muted) here and in the other primitives.
 * Tailwind's bg-muted utility resolves through --background-muted, an alias
 * declared in compat.css, which upstream has marked for deletion.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-panel text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-600 text-background hover:bg-brand-500',
        outline: 'border border-input bg-transparent text-foreground hover:bg-(--muted)',
        secondary: 'bg-(--muted) text-foreground hover:bg-secondary',
        ghost: 'text-muted-foreground hover:bg-(--muted) hover:text-foreground',
        destructive: 'bg-destructive-500 text-background hover:bg-destructive-400',
        link: 'text-brand-link underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3.5 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
