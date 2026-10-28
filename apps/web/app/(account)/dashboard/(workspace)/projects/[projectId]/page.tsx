import type { Metadata } from "next";
import { ProjectOverview } from "@/features/projects/overview/project-overview";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Overview" };

export default function ProjectPage() {
  return <ProjectOverview />;
}
