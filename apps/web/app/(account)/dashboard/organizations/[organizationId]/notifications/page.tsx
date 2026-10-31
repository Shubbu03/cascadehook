import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NotificationInbox } from "@/features/notifications/notification-inbox";
import { NotificationPageSkeleton } from "@/features/notifications/notification-skeleton";
import { uuidPattern } from "@/lib/format";
import { requireSession } from "@/lib/server/session";

export const instant = false;
export const metadata: Metadata = { title: "Notifications" };

async function Content({ params }: { params: Promise<{ organizationId: string }> }) {
  await requireSession();
  const { organizationId } = await params;
  if (!uuidPattern.test(organizationId)) notFound();
  return <NotificationInbox key={organizationId} organizationId={organizationId} />;
}

export default function Page(props: { params: Promise<{ organizationId: string }> }) {
  return <Suspense fallback={<main id="main-content" className="dashboard-main"><NotificationPageSkeleton /></main>}>
    <Content {...props} />
  </Suspense>;
}
