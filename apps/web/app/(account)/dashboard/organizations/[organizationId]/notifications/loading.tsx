import { NotificationPageSkeleton } from "@/features/notifications/notification-skeleton";
import { dashboardMain } from "@/components/styles";

export default function Loading() {
  return <main id="main-content" data-ui="dashboard-main" className={dashboardMain}><NotificationPageSkeleton /></main>;
}
