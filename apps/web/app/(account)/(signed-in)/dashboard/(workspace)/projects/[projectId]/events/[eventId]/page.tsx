import type { Metadata } from "next";
import { EventRoute } from "@/features/workspace/routes";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Event details" };

export default function Page() {
  return <EventRoute />;
}
