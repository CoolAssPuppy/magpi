'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  // The server has no way to know the stored theme, so rendering the active
  // state before hydration guarantees a mismatch.
  useEffect(() => setIsMounted(true), []);

  return (
    <div className="inline-flex rounded-[var(--radius-panel)] border border-border p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={isMounted ? theme === value : undefined}
          onClick={() => setTheme(value)}
          className={cn(
            'rounded-[calc(var(--radius-panel)-2px)] p-1.5 transition-colors motion-reduce:transition-none',
            isMounted && theme === value
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
