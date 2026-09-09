import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-48 w-full max-w-2xl" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
