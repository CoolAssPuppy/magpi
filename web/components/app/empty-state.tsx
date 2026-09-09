import type { ReactNode } from 'react';

/**
 * A knowledge base is empty on day one for every single user, so this is a
 * primary screen and not a fallback. It always names the next action.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-border flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed p-8">
      <h2 className="font-heading text-foreground text-base font-medium">{title}</h2>
      <p className="text-foreground-lighter max-w-[var(--measure-prose)] text-sm">{description}</p>
      {action}
    </div>
  );
}
