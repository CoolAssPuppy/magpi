import { PanelSkeleton } from '@/components/admin/panel-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-7 w-40" />
      <PanelSkeleton rows={4} />
    </div>
  );
}
