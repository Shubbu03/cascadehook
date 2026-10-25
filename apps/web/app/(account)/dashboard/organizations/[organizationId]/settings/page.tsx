import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrganizationSettings } from "@/features/settings/organization-settings";
import { ContentLoading } from "@/features/workspace/loading";
import { requireSession } from "@/lib/server/session";
import { uuidPattern } from "@/lib/format";

export const metadata: Metadata = { title: "Organization settings" };
async function Content({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await requireSession();
  const { organizationId } = await params;
  if (!uuidPattern.test(organizationId)) notFound();
  return (
    <OrganizationSettings
      key={organizationId}
      organizationId={organizationId}
    />
  );
}
export default function Page(props: {
  params: Promise<{ organizationId: string }>;
}) {
  return (
    <Suspense fallback={<ContentLoading />}>
      <Content {...props} />
    </Suspense>
  );
}
