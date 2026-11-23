import type { Metadata } from "next";
import { redirect } from "next/navigation";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Register endpoint" };
export default async function NewEndpointPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(
    "/dashboard/projects/" + encodeURIComponent(projectId) + "/endpoints?register=1",
  );
}
