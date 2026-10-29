import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DeliveryDetail } from "@/features/activity/delivery-detail";
import { PageSkeleton } from "@/features/workspace/skeletons";
import { requireSession } from "@/lib/server/session";
import { uuidPattern } from "@/lib/format";

// The authenticated client workspace intentionally gates this page during SSR.
export const instant = false;

export const metadata: Metadata = { title: "Delivery details" };
async function Content({
  params,
}: {
  params: Promise<{ deliveryId: string }>;
}) {
  await requireSession();
  const { deliveryId } = await params;
  if (!uuidPattern.test(deliveryId)) notFound();
  return <DeliveryDetail key={deliveryId} deliveryId={deliveryId} />;
}
export default function Page(props: {
  params: Promise<{ deliveryId: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton variant="delivery" />}>
      <Content {...props} />
    </Suspense>
  );
}
