import type { Metadata } from "next";
import { EventList } from "@/features/activity/event-list";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Events" };
export default function Page() {
  return <EventList />;
}
