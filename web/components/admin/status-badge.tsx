import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'positive' | 'warning' | 'critical';

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  positive: 'border-border-brand bg-brand-200 text-brand-600',
  warning: 'border-border-warning bg-warning-200 text-warning-600',
  critical: 'border-border-destructive bg-destructive-200 text-destructive-600',
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}
