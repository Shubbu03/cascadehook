import type { Metadata } from "next";
import { ProjectUsage } from "@/features/settings/usage";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Usage" };
export default function Page() {
  return <ProjectUsage />;
}
