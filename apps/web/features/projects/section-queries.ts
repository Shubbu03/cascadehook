import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { projectPath, type Delivery, type EventSummary } from "@/features/activity/types";
import type { APIKey } from "@/features/api-keys/types";
import { endpointKeys, endpointPath, type Endpoint } from "@/features/endpoints/types";
import type { Usage } from "@/features/settings/types";
import type { Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

// List queries for the project sections. Pages and prefetching share these so
// a prefetched list lands under the exact key the page reads.
type GetToken = () => Promise<string | null>;
type Params = Record<string, string>;

function listQuery<T>(queryKey: readonly unknown[], path: string, params: Params, getToken: GetToken) {
  return infiniteQueryOptions({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<T>>(path, getToken, {
        signal,
        params: { limit: 20, ...params, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}

export function deliveryListQuery(userId: string, projectId: string, filters: Params, getToken: GetToken) {
  return listQuery<Delivery>(
    [...queryKeys.deliveries(userId, projectId), filters],
    projectPath(projectId, "deliveries"),
    filters,
    getToken,
  );
}

export function eventListQuery(userId: string, projectId: string, eventType: string, getToken: GetToken) {
  return listQuery<EventSummary>(
    [...queryKeys.events(userId, projectId), eventType],
    projectPath(projectId, "events"),
    eventType ? { event_type: eventType } : {},
    getToken,
  );
}

export function endpointListQuery(
  userId: string,
  projectId: string,
  filters: { enabled: string; eventType: string },
  getToken: GetToken,
) {
  return listQuery<Endpoint>(
    [...endpointKeys.lists(userId, projectId), filters],
    endpointPath(projectId),
    {
      ...(filters.enabled ? { enabled: filters.enabled } : {}),
      ...(filters.eventType ? { event_type: filters.eventType } : {}),
    },
    getToken,
  );
}

export const unfilteredEndpoints = { enabled: "", eventType: "" };

export function apiKeyListQuery(
  userId: string,
  projectId: string,
  filters: { environment: string; status: string },
  getToken: GetToken,
) {
  return listQuery<APIKey>(
    [...apiKeyKeys(userId, projectId), filters.environment, filters.status],
    projectPath(projectId, "api-keys"),
    {
      ...(filters.environment ? { environment: filters.environment } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    getToken,
  );
}

export function apiKeyKeys(userId: string, projectId: string) {
  return ["api-keys", userId, projectId] as const;
}

export function projectUsageQuery(userId: string, projectId: string, getToken: GetToken) {
  return queryOptions({
    queryKey: queryKeys.projectUsage(userId, projectId),
    queryFn: ({ signal }) => apiRequest<Usage>(projectPath(projectId, "usage"), getToken, { signal }),
  });
}

export function organizationUsageQuery(userId: string, organizationId: string, getToken: GetToken) {
  return queryOptions({
    queryKey: queryKeys.organizationUsage(userId, organizationId),
    queryFn: ({ signal }) =>
      apiRequest<Usage>(
        "/v1/organizations/" + encodeURIComponent(organizationId) + "/usage",
        getToken,
        { signal },
      ),
  });
}
