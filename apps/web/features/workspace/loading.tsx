import { Skeleton } from "@/components/skeleton";
import { RouteContentLoading } from "./route-loading";
import { FormSkeleton } from "./skeletons";

export function AccountLoading() {
  return (
    <main id="main-content" data-ui="skeleton-account-loading" className="grid place-items-center min-h-svh py-8 px-5">
      <FormSkeleton label="Loading your account…" />
    </main>
  );
}

export function WorkspaceLoading() {
  return (
    <div data-ui="dashboard-shell skeleton-shell" className={"[--sidebar-width:224px] [--topbar-height:60px] grid grid-cols-[var(--sidebar-width)_minmax(0,1fr)] min-h-svh items-start data-[collapsed=\"true\"]:[--sidebar-width:68px] max-[56.25rem]:grid-cols-[minmax(0,1fr)]"}>
      <aside data-ui="dashboard-sidebar" className="sticky top-0 flex flex-col h-dvh min-w-0 border-r [border-right-style:solid] border-r-border bg-surface max-[56.25rem]:hidden" aria-hidden="true">
        <div data-ui="sidebar-brand" className={"flex items-center justify-between shrink-0 min-h-(--topbar-height,60px) gap-2.5 px-4 [[data-ui~='dashboard-shell'][data-collapsed=\"true\"]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=\"true\"]_[data-ui~='dashboard-sidebar']_&]:px-0"}>
          <Skeleton width={166} height={24} />
        </div>
        <div className="grid gap-5 py-7 px-5.5 [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-3">
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <div key={index}>
              <Skeleton width={18} height={18} />
              <Skeleton width={index % 2 ? 90 : 115} />
            </div>
          ))}
        </div>
      </aside>
      <div className="min-w-0">
        <div data-ui="dashboard-topbar" className="sticky z-30 top-0 flex items-center h-(--topbar-height) border-b [border-bottom-style:solid] border-b-border bg-background px-6 gap-3.5 max-[56.25rem]:px-4 max-[56.25rem]:gap-2.5" aria-hidden="true">
          <div data-ui="skeleton-shell-switchers" className="flex items-center flex-1 min-w-0 gap-3">
            <Skeleton width={28} height={28} />
            <Skeleton width={104} height={12} />
            <Skeleton width={140} height={12} />
          </div>
          <Skeleton width={30} height={30} className="rounded-full [[data-ui~='skeleton-shell']_[data-ui~='dashboard-topbar']_>_&]:ml-auto" />
        </div>
        <div className="min-w-0">
          <main id="main-content" data-ui="dashboard-main" className="w-full min-w-0 min-h-[calc(100svh-var(--topbar-height,60px))] pt-7 pb-16 m-0 px-8 max-[56.25rem]:pt-6 max-[56.25rem]:pb-12 max-[56.25rem]:px-6 max-[37.5rem]:pt-5.5 max-[37.5rem]:pb-10 max-[37.5rem]:px-4.5">
            <RouteContentLoading />
          </main>
        </div>
      </div>
    </div>
  );
}
