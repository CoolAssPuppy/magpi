import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-9 w-full max-w-md" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
