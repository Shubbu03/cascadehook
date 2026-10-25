import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventDetail } from "@/features/activity/event-detail";
import { ContentLoading } from "@/features/workspace/loading";
import { requireSession } from "@/lib/server/session";
import { uuidPattern } from "@/lib/format";

export const metadata: Metadata = { title: "Event details" };
async function Content({ params }: { params: Promise<{ eventId: string }> }) {
  await requireSession();
  const { eventId } = await params;
  if (!uuidPattern.test(eventId)) notFound();
  return <EventDetail key={eventId} eventId={eventId} />;
}
export default function Page(props: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense fallback={<ContentLoading />}>
      <Content {...props} />
    </Suspense>
  );
}
