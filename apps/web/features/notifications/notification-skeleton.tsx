import { Skeleton, SkeletonRegion } from "@/components/skeleton";

export function NotificationListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <SkeletonRegion label="Loading notifications…">
      {Array.from({ length: rows }, (_, index) => (
        <div className="notification-item notification-item-skeleton" key={index}>
          <Skeleton width={32} height={32} />
          <div className="notification-copy skeleton-stack">
            <Skeleton width={index % 2 ? "65%" : "80%"} height={14} />
            <Skeleton width="95%" height={11} />
            <Skeleton width="75%" height={11} />
            <Skeleton width={120} height={10} />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

export function NotificationPageSkeleton() {
  return (
    <div className="notification-inbox">
      <SkeletonRegion label="Loading notification inbox…">
        <div className="skeleton-heading">
          <div className="skeleton-stack"><Skeleton width={170} height={26} /><Skeleton width={260} height={12} /></div>
          <Skeleton width={120} height={36} />
        </div>
        <div className="skeleton-filters">
          <Skeleton width={270} height={38} /><Skeleton width={150} height={36} /><Skeleton width={180} height={36} />
        </div>
      </SkeletonRegion>
      <div className="notification-list-panel"><NotificationListSkeleton rows={6} /></div>
    </div>
  );
}
