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
  // next-themes reports an undefined theme until it has read storage, on server and first render.
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
              ? 'bg-secondary text-foreground'
              : 'text-tertiary-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
