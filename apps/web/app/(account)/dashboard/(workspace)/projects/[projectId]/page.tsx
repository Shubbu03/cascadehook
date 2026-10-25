import type { Metadata } from "next";
import { ProjectOverview } from "@/features/projects/overview/project-overview";

export const metadata: Metadata = { title: "Overview" };

export default function ProjectPage() {
  return <ProjectOverview />;
}
