import { Skeleton } from "@/components/skeleton";
import { RouteContentLoading } from "./route-loading";
import { FormSkeleton } from "./skeletons";

export function AccountLoading() {
  return (
    <main id="main-content" className="skeleton-account-loading">
      <FormSkeleton label="Loading your account…" />
    </main>
  );
}

export function WorkspaceLoading() {
  return (
    <div className="dashboard-shell skeleton-shell">
      <aside className="dashboard-sidebar" aria-hidden="true">
        <div className="sidebar-brand">
          <Skeleton width={166} height={24} />
        </div>
        <div className="skeleton-shell-nav">
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <div key={index}>
              <Skeleton width={18} height={18} />
              <Skeleton width={index % 2 ? 90 : 115} />
            </div>
          ))}
        </div>
      </aside>
      <div className="dashboard-frame">
        <div className="dashboard-topbar" aria-hidden="true">
          <div className="skeleton-shell-switchers">
            <Skeleton width={28} height={28} />
            <Skeleton width={104} height={12} />
            <Skeleton width={140} height={12} />
          </div>
          <Skeleton width={30} height={30} className="skeleton-circle" />
        </div>
        <div className="dashboard-content">
          <main id="main-content" className="dashboard-main">
            <RouteContentLoading />
          </main>
        </div>
      </div>
    </div>
  );
}
