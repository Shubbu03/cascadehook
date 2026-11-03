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
        <main id="main-content" data-ui="dashboard-main" className="w-full min-w-0 min-h-[calc(100svh-var(--topbar-height,60px))] pt-7 pb-16 m-0 px-8 max-[56.25rem]:pt-6 max-[56.25rem]:pb-12 max-[56.25rem]:px-6 max-[37.5rem]:pt-5.5 max-[37.5rem]:pb-10 max-[37.5rem]:px-4.5">
          <PageSkeleton variant="projects" />
        </main>
      }
    >
      <AuthenticatedWorkspace />
    </Suspense>
  );
}
