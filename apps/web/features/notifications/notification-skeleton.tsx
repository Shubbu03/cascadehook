import { Skeleton, SkeletonRegion } from "@/components/skeleton";

export function NotificationListSkeleton({ rows = 4 }: { rows?: number; }) {
  return (
    <SkeletonRegion label="Loading notifications…">
      {Array.from({ length: rows }, (_, index) => (
        <div className={"flex items-start border-b [border-bottom-style:solid] border-b-border gap-3 p-5 last:border-b-0 data-[unread=\"true\"]:bg-[color-mix(in_srgb,var(--accent-subtle)_20%,transparent)] in-data-[ui~='notification-feed-compact']:grid in-data-[ui~='notification-feed-compact']:grid-cols-[28px_minmax(0,1fr)_28px] in-data-[ui~='notification-feed-compact']:gap-2.5 in-data-[ui~='notification-feed-compact']:py-3.75 in-data-[ui~='notification-feed-compact']:px-4.5 max-[37.5rem]:grid max-[37.5rem]:grid-cols-[28px_minmax(0,1fr)] max-[37.5rem]:gap-2.5 max-[37.5rem]:p-4 pointer-coarse:in-data-[ui~='notification-feed-compact']:grid-cols-[28px_minmax(0,1fr)_44px]"} key={index}>
          <Skeleton width={32} height={32} />
          <div className="grid min-w-0 flex-1 wrap-anywhere [&_h3]:text-[14px] [&_h3]:font-medium [&_h3]:leading-[1.55] [&_h3_a]:text-inherit gap-2.5 [[data-ui~='notification-feed-compact']_&_h3]:text-[12px] [&_h3_a:hover]:text-accent [&_h3_a:hover]:underline [&_h3_a:hover]:underline-offset-[3px]">
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
    <div className="max-w-280">
      <SkeletonRegion label="Loading notification inbox…">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="grid min-w-0 gap-2.5"><Skeleton width={170} height={26} /><Skeleton width={260} height={12} /></div>
          <Skeleton width={120} height={36} />
        </div>
        <div className="flex flex-wrap mb-5 pb-5 border-b border-b-border gap-3">
          <Skeleton width={270} height={38} /><Skeleton width={150} height={36} /><Skeleton width={180} height={36} />
        </div>
      </SkeletonRegion>
      <div className="overflow-hidden rounded-lg bg-surface border border-solid border-border"><NotificationListSkeleton rows={6} /></div>
    </div>
  );
}
