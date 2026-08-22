import Link from "next/link";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Small caps context, such as PAGES, NONE ENABLED. */
  kicker: string;
  heading: string;
  body: string;
  action?: { href: string; label: string };
  children?: ReactNode;
}

/**
 * One empty-state pattern, used by every page.
 *
 * The dashed border says the panel is waiting rather than broken, and the
 * action names the next step. An empty state with no action is a dead end.
 */
export function EmptyState({ kicker, heading, body, action, children }: EmptyStateProps) {
  return (
    <div className="gap-md rounded-panel border-border-strong bg-surface px-xl py-2xl flex flex-col items-start border border-dashed">
      <span className="font-display text-2xs text-ink-faint tracking-wide">{kicker}</span>
      <h2 className="font-display text-xl">{heading}</h2>
      <p className="text-ink-muted max-w-prose text-base">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="rounded-panel bg-accent px-lg py-sm font-display text-accent-ink text-sm font-medium"
        >
          {action.label}
        </Link>
      ) : null}
      {children}
    </div>
  );
}

export interface ErrorPanelProps {
  kicker: string;
  heading: string;
  body: string;
  /** Amber for something the user can fix in the field, rust for a failure. */
  tone?: "caution" | "critical";
  action?: { href: string; label: string };
}

/** One error pattern: what failed, what it cost, and what to do about it. */
export function ErrorPanel({ kicker, heading, body, tone = "critical", action }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      className={
        tone === "caution"
          ? "gap-sm rounded-hairline border-l-edge border-caution bg-surface px-xl py-lg flex flex-col"
          : "gap-sm rounded-hairline border-l-edge border-critical bg-surface px-xl py-lg flex flex-col"
      }
    >
      <span className="font-display text-2xs text-ink-faint tracking-wide">{kicker}</span>
      <h2 className="font-display text-lg">{heading}</h2>
      <p className="text-ink-muted max-w-prose text-base">{body}</p>
      {action ? (
        <Link href={action.href} className="font-display text-accent text-sm">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** One loading pattern: hold the layout so nothing jumps when data lands. */
export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="gap-lg flex flex-col" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="gap-md flex items-center">
          <span className="size-sm rounded-pill bg-border-strong" />
          <span className="h-md bg-border-strong flex-1" />
          <span className="h-md w-4xl bg-border" />
        </div>
      ))}
    </div>
  );
}
