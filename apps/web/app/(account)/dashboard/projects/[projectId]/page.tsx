import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireSession } from "@/lib/server/session";

async function ProjectEntry({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requireSession();
  const { projectId } = await params;
  return redirect(
    "/dashboard/projects/" + encodeURIComponent(projectId) + "/endpoints",
  );
}

export default function ProjectPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense>
      <ProjectEntry {...props} />
    </Suspense>
  );
}
