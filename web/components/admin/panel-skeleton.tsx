import { Skeleton } from '@/components/ui/skeleton';

/** The shape of a panel while its query is in flight. Never a spinner. */
export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-6 w-full" />
      ))}
    </div>
  );
}
