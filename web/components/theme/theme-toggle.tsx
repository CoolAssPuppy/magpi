'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

const NEVER_CHANGES = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // React does not patch an attribute mismatch during hydration, so a value the server could not
  // know has to arrive after the first client render or it never arrives at all.
  const mounted = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
  const selected = mounted ? theme : undefined;

  return (
    <div className="inline-flex rounded-[var(--radius-panel)] border border-border p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={selected === undefined ? undefined : selected === value}
          onClick={() => setTheme(value)}
          className={cn(
            'rounded-[calc(var(--radius-panel)-2px)] p-1.5 transition-colors motion-reduce:transition-none',
            selected === value
              ? 'bg-muted text-foreground'
              : 'text-tertiary-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
