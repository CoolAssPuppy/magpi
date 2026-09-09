import { Skeleton } from '@/components/ui/skeleton';

export default function ChatLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-64 rounded-[var(--radius-panel)] motion-reduce:animate-none" />
        <Skeleton className="h-4 w-80 rounded-[var(--radius-panel)] motion-reduce:animate-none" />
      </div>
      <Skeleton className="h-[52px] w-full rounded-[var(--radius-panel)] motion-reduce:animate-none" />
    </div>
  );
}
