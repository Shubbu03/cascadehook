import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectWorkspace } from "@/features/projects/project-workspace";
import { RouteContentLoading } from "@/features/workspace/route-loading";
import { uuidPattern } from "@/lib/format";
import { requireSession } from "@/lib/server/session";

async function ProjectLayoutContent({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string; }>;
}) {
  await requireSession();
  const { projectId } = await params;
  if (!uuidPattern.test(projectId)) notFound();
  return (
    <ProjectWorkspace key={projectId} projectId={projectId}>
      {children}
    </ProjectWorkspace>
  );
}

export default function ProjectLayout(props: {
  children: React.ReactNode;
  params: Promise<{ projectId: string; }>;
}) {
  return (
    <Suspense
      fallback={
        <main id="main-content" data-ui="dashboard-main" className="w-full min-w-0 min-h-[calc(100svh-var(--topbar-height,60px))] pt-7 pb-16 m-0 px-8 max-[56.25rem]:pt-6 max-[56.25rem]:pb-12 max-[56.25rem]:px-6 max-[37.5rem]:pt-5.5 max-[37.5rem]:pb-10 max-[37.5rem]:px-4.5">
          <RouteContentLoading />
        </main>
      }
    >
      <ProjectLayoutContent {...props} />
    </Suspense>
  );
}
