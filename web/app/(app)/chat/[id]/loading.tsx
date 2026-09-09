import { Skeleton } from '@/components/ui/skeleton';

export default function ConversationLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <Skeleton className="h-6 w-56 rounded-[var(--radius-panel)] motion-reduce:animate-none" />

      <div className="flex flex-1 flex-col gap-8">
        <Skeleton className="h-5 w-72 rounded-[var(--radius-panel)] motion-reduce:animate-none" />
        <div className="flex max-w-[var(--measure-prose)] flex-col gap-2">
          <Skeleton className="h-4 w-full rounded-[var(--radius-panel)] motion-reduce:animate-none" />
          <Skeleton className="h-4 w-full rounded-[var(--radius-panel)] motion-reduce:animate-none" />
          <Skeleton className="h-4 w-2/3 rounded-[var(--radius-panel)] motion-reduce:animate-none" />
        </div>
      </div>

      <Skeleton className="h-[52px] w-full rounded-[var(--radius-panel)] motion-reduce:animate-none" />
    </div>
  );
}
