import type { ReactNode } from 'react';

/** One analytics panel, separated from its peers by a hairline rule rather than a card. */
export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="font-heading text-base font-medium text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-[var(--measure-prose)] text-sm text-tertiary-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
