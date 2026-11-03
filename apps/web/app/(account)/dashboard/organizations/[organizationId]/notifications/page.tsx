import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NotificationInbox } from "@/features/notifications/notification-inbox";
import { NotificationPageSkeleton } from "@/features/notifications/notification-skeleton";
import { uuidPattern } from "@/lib/format";
import { requireSession } from "@/lib/server/session";

export const instant = false;
export const metadata: Metadata = { title: "Notifications" };

async function Content({ params }: { params: Promise<{ organizationId: string; }>; }) {
  await requireSession();
  const { organizationId } = await params;
  if (!uuidPattern.test(organizationId)) notFound();
  return <NotificationInbox key={organizationId} organizationId={organizationId} />;
}

export default function Page(props: { params: Promise<{ organizationId: string; }>; }) {
  return <Suspense fallback={<main id="main-content" data-ui="dashboard-main" className="w-full min-w-0 min-h-[calc(100svh-var(--topbar-height,60px))] pt-7 pb-16 m-0 px-8 max-[56.25rem]:pt-6 max-[56.25rem]:pb-12 max-[56.25rem]:px-6 max-[37.5rem]:pt-5.5 max-[37.5rem]:pb-10 max-[37.5rem]:px-4.5"><NotificationPageSkeleton /></main>}>
    <Content {...props} />
  </Suspense>;
}
