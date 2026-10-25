import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkspaceHome } from "@/features/workspace/workspace-home";
import { ContentLoading } from "@/features/workspace/loading";
import { requireSession } from "@/lib/server/session";

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
    <Suspense fallback={<ContentLoading />}>
      <AuthenticatedWorkspace />
    </Suspense>
  );
}
