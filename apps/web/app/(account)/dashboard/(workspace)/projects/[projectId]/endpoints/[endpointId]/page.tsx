import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EndpointDetail } from "@/features/endpoints/endpoint-detail";
import { ContentLoading } from "@/features/workspace/loading";
import { requireSession } from "@/lib/server/session";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Endpoint settings" };
async function EndpointContent({
  params,
}: {
  params: Promise<{ endpointId: string }>;
}) {
  await requireSession();
  const { endpointId } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      endpointId,
    )
  )
    notFound();
  return <EndpointDetail key={endpointId} endpointId={endpointId} />;
}
export default function EndpointPage(props: {
  params: Promise<{ endpointId: string }>;
}) {
  return (
    <Suspense fallback={<ContentLoading />}>
      <EndpointContent {...props} />
    </Suspense>
  );
}
