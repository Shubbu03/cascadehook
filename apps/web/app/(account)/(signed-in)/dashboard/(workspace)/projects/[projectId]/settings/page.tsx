import type { Metadata } from "next";
import { ProjectSettings } from "@/features/settings/project-settings";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Project settings" };
export default function Page() {
  return <ProjectSettings />;
}
