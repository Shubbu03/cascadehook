import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectWorkspace } from "@/features/projects/project-workspace";
import { ContentLoading } from "@/features/workspace/loading";
import { uuidPattern } from "@/lib/format";
import { requireSession } from "@/lib/server/session";

async function ProjectLayoutContent({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
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
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<ContentLoading />}>
      <ProjectLayoutContent {...props} />
    </Suspense>
  );
}
