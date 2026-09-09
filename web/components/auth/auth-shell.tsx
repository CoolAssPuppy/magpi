import Link from 'next/link';
import type { ReactNode } from 'react';
import { MagpieMark } from '@/components/brand/magpie-mark';

/**
 * One frame for every auth screen. A single centered panel is the right
 * affordance here, so the card earns its place; nothing nests inside it.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-8 p-6">
      <Link
        href="/"
        className="flex items-center gap-2.5 font-heading text-lg tracking-tight text-foreground"
      >
        <MagpieMark size={28} />
        Magpi
      </Link>

      <div className="w-full max-w-sm rounded-[var(--radius-panel)] border border-border bg-background-surface-100 p-6">
        <h1 className="font-heading text-lg leading-tight font-medium text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-foreground-lighter">{description}</p>
        <div className="mt-6">{children}</div>
      </div>

      {footer ? <div className="text-sm text-foreground-lighter">{footer}</div> : null}
    </div>
  );
}
