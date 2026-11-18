import type { Metadata } from "next";
import { WorkspaceHome } from "@/features/workspace/workspace-home";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = {
  title: "Your workspace",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <WorkspaceHome />;
}
