import type { StatusTone } from '@/lib/ui/status-tone';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'border-border bg-background-surface-200 text-foreground-light',
  positive: 'border-border-brand bg-brand-200 text-brand-600',
  progress: 'border-border-strong bg-background-surface-200 text-foreground-light',
  warning: 'border-border-warning bg-warning-200 text-warning-600',
  destructive: 'border-border-destructive bg-destructive-200 text-destructive-600',
};

/**
 * Status as a full border, a background tint and a leading dot. Never a side
 * stripe, and never a spinner: a revoked connection is a finished state and has
 * to read as one.
 *
 * Shared by connections and dreams, which is why it is written once here.
 */
export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
      )}
    >
      <span
        aria-hidden="true"
        data-testid={tone === 'progress' ? 'progress-dot' : undefined}
        className={cn(
          'size-1.5 rounded-full bg-current',
          // Reduced motion gets the same dot, held still. The label already says
          // what is happening, so nothing is lost.
          tone === 'progress' && 'motion-safe:animate-pulse',
        )}
      />
      {label}
    </span>
  );
}
