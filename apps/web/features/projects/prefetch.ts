import { useAuth } from "@clerk/nextjs";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  overviewDeliveriesQuery,
  overviewEventsQuery,
  setupEndpointsQuery,
} from "@/features/projects/overview/queries";
import { useSessionUserId } from "@/features/workspace/session";
import { projectsQuery } from "@/features/workspace/queries";
import type { Project } from "@/features/workspace/types";
import { queryKeys } from "@/lib/query-keys";
import {
  apiKeyListQuery,
  deliveryListQuery,
  endpointListQuery,
  eventListQuery,
  organizationUsageQuery,
  projectUsageQuery,
  unfilteredEndpoints,
} from "./section-queries";

type GetToken = () => Promise<string | null>;

export type ProjectSection = "overview" | "deliveries" | "events" | "endpoints" | "api-keys" | "usage";

const sections = new Set<string>(["deliveries", "events", "endpoints", "api-keys", "usage"]);

// Maps the segments below /dashboard/projects/[projectId] to the list view
// they show. Detail pages and settings have nothing worth preloading.
export function projectSectionAt(segments: string[]): ProjectSection | null {
  if (segments.length === 0) return "overview";
  return segments.length === 1 && sections.has(segments[0]) ? (segments[0] as ProjectSection) : null;
}

// Loads a section's default, unfiltered view under the key its page reads.
// Data that is still fresh isn't fetched again.
export function prefetchProjectSection(
  client: QueryClient,
  userId: string,
  projectId: string,
  section: ProjectSection,
  getToken: GetToken,
): Promise<unknown> {
  switch (section) {
    case "overview":
      // Role-dependent overview queries wait for the project to load. The
      // overview always refetches on mount, so a prefetch only needs to cover
      // a first visit and can skip data loaded in the last 30 seconds.
      return Promise.all([
        client.prefetchInfiniteQuery({ ...setupEndpointsQuery(userId, projectId, getToken), staleTime: 30_000 }),
        client.prefetchQuery({ ...overviewDeliveriesQuery(userId, projectId, getToken), staleTime: 30_000 }),
        client.prefetchQuery({ ...overviewEventsQuery(userId, projectId, getToken), staleTime: 30_000 }),
      ]);
    case "deliveries":
      return client.prefetchInfiniteQuery(deliveryListQuery(userId, projectId, {}, getToken));
    case "events":
      return client.prefetchInfiniteQuery(eventListQuery(userId, projectId, "", getToken));
    case "endpoints":
      return client.prefetchInfiniteQuery(endpointListQuery(userId, projectId, unfilteredEndpoints, getToken));
    case "api-keys":
      return client.prefetchInfiniteQuery(
        apiKeyListQuery(userId, projectId, { environment: "", status: "" }, getToken),
      );
    case "usage": {
      const project = client.getQueryData<Project>(queryKeys.project(userId, projectId));
      return Promise.all([
        client.prefetchQuery(projectUsageQuery(userId, projectId, getToken)),
        project && client.prefetchQuery(organizationUsageQuery(userId, project.organization_id, getToken)),
      ]);
    }
  }
}

export function usePrefetch() {
  const client = useQueryClient();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const section = useCallback(
    (projectId: string, section: ProjectSection) =>
      void prefetchProjectSection(client, userId, projectId, section, getToken),
    [client, userId, getToken],
  );
  const projects = useCallback(
    (organizationId: string) => void client.prefetchInfiniteQuery(projectsQuery(userId, organizationId, getToken)),
    [client, userId, getToken],
  );
  const organizationUsage = useCallback(
    (organizationId: string) => void client.prefetchQuery(organizationUsageQuery(userId, organizationId, getToken)),
    [client, userId, getToken],
  );
  return { section, projects, organizationUsage };
}

// Props that start loading a link's data when the pointer or focus reaches it,
// ahead of the click.
export function prefetchOnIntent(load: () => void) {
  return { onMouseEnter: load, onFocus: load, onTouchStart: load };
}
