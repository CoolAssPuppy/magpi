import Link from 'next/link';
import type { ReactNode } from 'react';

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
      <Link href="/" className="font-heading text-foreground text-lg tracking-tight">
        Recall
      </Link>

      <div className="border-border bg-background-surface-100 w-full max-w-sm rounded-[var(--radius-panel)] border p-6">
        <h1 className="font-heading text-foreground text-lg leading-tight font-medium">{title}</h1>
        <p className="text-foreground-lighter mt-1 text-sm">{description}</p>
        <div className="mt-6">{children}</div>
      </div>

      {footer ? <div className="text-foreground-lighter text-sm">{footer}</div> : null}
    </div>
  );
}
