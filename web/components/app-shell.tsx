import Link from "next/link";
import type { ReactNode } from "react";

import { MagpieMark } from "@/components/magpie-mark";
import { ThemeToggle } from "@/components/theme-toggle";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/badges", label: "Badges" },
  { href: "/connections", label: "Connections" },
  { href: "/settings", label: "Settings" },
] as const;

export type NavHref = (typeof NAV_ITEMS)[number]["href"];

/**
 * Icons are drawn, not imported. The badge has no icon set, and a lucide glyph
 * on every row is the tell that gives a template away. Each shape is one
 * folded plane from the same geometry as the homepage bird.
 */
function NavGlyph({ isCurrent }: { isCurrent: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <path
        d="M0 7 L7 0 L7 14 Z"
        fill={isCurrent ? "var(--color-accent)" : "var(--color-border-strong)"}
      />
      <path
        d="M7 0 L14 3 L7 14 Z"
        fill={isCurrent ? "var(--color-accent-quiet)" : "var(--color-border)"}
      />
    </svg>
  );
}

export function Sidebar({ current }: { current: NavHref }) {
  return (
    <nav
      aria-label="Sections"
      className="gap-xl border-border bg-surface px-lg py-xl flex w-[232px] shrink-0 flex-col border-r"
    >
      <div className="gap-sm px-sm flex items-center">
        <MagpieMark size={22} />
        <span className="font-display text-sm font-bold">Magpi</span>
      </div>
      <ul className="gap-3xs flex flex-col">
        {NAV_ITEMS.map((item) => {
          const isCurrent = item.href === current;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={
                  isCurrent
                    ? "gap-sm rounded-hairline border-l-edge border-accent bg-raised px-sm py-sm font-display flex items-center text-sm"
                    : "gap-sm px-md py-sm font-display text-ink-muted hover:text-ink flex items-center text-sm"
                }
              >
                <NavGlyph isCurrent={isCurrent} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* mt-auto, so these sit on the floor of the sidebar however few
          sections there are above them. */}
      <div className="gap-md px-sm mt-auto flex flex-col items-start">
        <ThemeToggle />
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="font-display text-ink-muted hover:text-ink text-sm">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}

export interface AppShellProps {
  current: NavHref;
  title: string;
  /** A short status for the top right, such as SAVED or WAITING FOR THE BADGE. */
  status?: ReactNode;
  children: ReactNode;
}

export function AppShell({ current, title, status, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar current={current} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border px-2xl py-lg flex items-center justify-between border-b">
          <h1 className="font-display text-md font-medium">{title}</h1>
          <div className="gap-lg flex items-center">{status}</div>
        </header>
        <main className="p-2xl min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
