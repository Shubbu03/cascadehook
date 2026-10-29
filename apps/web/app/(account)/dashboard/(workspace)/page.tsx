import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkspaceHome } from "@/features/workspace/workspace-home";
import { PageSkeleton } from "@/features/workspace/skeletons";
import { requireSession } from "@/lib/server/session";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = {
  title: "Your workspace",
  robots: { index: false, follow: false },
};

async function AuthenticatedWorkspace() {
  await requireSession();
  return <WorkspaceHome />;
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="dashboard-main">
          <PageSkeleton variant="projects" />
        </main>
      }
    >
      <AuthenticatedWorkspace />
    </Suspense>
  );
}
