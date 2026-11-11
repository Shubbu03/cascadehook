import { RouteContentLoading } from "@/features/workspace/route-loading";
import { dashboardMain } from "@/components/styles";

export default function Loading() {
  return (
    <main id="main-content" data-ui="dashboard-main" className={dashboardMain}>
      <RouteContentLoading />
    </main>
  );
}
