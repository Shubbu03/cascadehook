import type { Metadata } from "next";
import { NotificationsRoute } from "@/features/workspace/routes";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <NotificationsRoute />;
}
