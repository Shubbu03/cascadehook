import type { Metadata } from "next";
import { EventList } from "@/features/activity/event-list";

export const metadata: Metadata = { title: "Events" };
export default function Page() {
  return <EventList />;
}
