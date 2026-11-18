"use client";

// Route entry points that read their IDs from the URL in the browser. Reading
// params on the server would tie each page to its URL and keep Next.js from
// prefetching it, so every click would wait on a Worker render.
import { notFound, useParams } from "next/navigation";
import { DeliveryDetail } from "@/features/activity/delivery-detail";
import { EventDetail } from "@/features/activity/event-detail";
import { EndpointDetail } from "@/features/endpoints/endpoint-detail";
import { NotificationInbox } from "@/features/notifications/notification-inbox";
import { ProjectWorkspace } from "@/features/projects/project-workspace";
import { OrganizationSettings } from "@/features/settings/organization-settings";
import { OrganizationUsage } from "@/features/settings/organization-usage";
import { uuidPattern } from "@/lib/format";

function useUuidParam(name: string) {
  const value = useParams()[name];
  if (typeof value !== "string" || !uuidPattern.test(value)) notFound();
  return value;
}

export function ProjectRoute({ children }: { children: React.ReactNode }) {
  const projectId = useUuidParam("projectId");
  return (
    <ProjectWorkspace key={projectId} projectId={projectId}>
      {children}
    </ProjectWorkspace>
  );
}

export function DeliveryRoute() {
  const deliveryId = useUuidParam("deliveryId");
  return <DeliveryDetail key={deliveryId} deliveryId={deliveryId} />;
}

export function EventRoute() {
  const eventId = useUuidParam("eventId");
  return <EventDetail key={eventId} eventId={eventId} />;
}

export function EndpointRoute() {
  const endpointId = useUuidParam("endpointId");
  return <EndpointDetail key={endpointId} endpointId={endpointId} />;
}

export function NotificationsRoute() {
  const organizationId = useUuidParam("organizationId");
  return <NotificationInbox key={organizationId} organizationId={organizationId} />;
}

export function OrganizationSettingsRoute() {
  const organizationId = useUuidParam("organizationId");
  return <OrganizationSettings key={organizationId} organizationId={organizationId} />;
}

export function OrganizationUsageRoute() {
  const organizationId = useUuidParam("organizationId");
  return <OrganizationUsage key={organizationId} organizationId={organizationId} />;
}
