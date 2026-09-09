'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

export function ThemeToggle() {
  // next-themes reports an undefined theme until it has read storage, on the
  // server and on the first client render alike, so the two agree and no mounted
  // flag is needed to avoid a hydration mismatch.
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex rounded-[var(--radius-panel)] border border-border p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={theme === undefined ? undefined : theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            'rounded-[calc(var(--radius-panel)-2px)] p-1.5 transition-colors motion-reduce:transition-none',
            theme === value
              ? 'bg-background-surface-300 text-foreground'
              : 'text-foreground-lighter hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
