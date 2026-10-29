import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
} from "@tanstack/react-query";
import type { Delivery, EventSummary } from "@/features/activity/types";
import { projectPath } from "@/features/activity/types";
import type { APIKey } from "@/features/api-keys/types";
import {
  endpointKeys,
  endpointPath,
  type Endpoint,
} from "@/features/endpoints/types";
import type { Page } from "@/features/workspace/types";
import type { Usage } from "@/features/settings/types";
import { apiRequest } from "@/lib/api";
import type { Activity } from "./setup";

type GetToken = () => Promise<string | null>;
const freshness = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchInterval: 15_000,
};

export function setupEndpointsQuery(
  userId: string,
  projectId: string,
  getToken: GetToken,
) {
  return infiniteQueryOptions({
    queryKey: [...endpointKeys.lists(userId, projectId), "overview"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<Endpoint>>(endpointPath(projectId), getToken, {
        signal,
        params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    ...freshness,
  });
}

export function setupKeyQuery(
  userId: string,
  projectId: string,
  canManage: boolean,
  getToken: GetToken,
) {
  return queryOptions({
    queryKey: ["api-keys", userId, projectId, "overview-active"],
    queryFn: canManage
      ? ({ signal }) =>
          apiRequest<Page<APIKey>>(
            projectPath(projectId, "api-keys"),
            getToken,
            {
              signal,
              params: { status: "active", limit: 1 },
            },
          )
      : skipToken,
    ...freshness,
  });
}

export function setupActivityQuery(
  userId: string,
  projectId: string,
  endpointId: string | undefined,
  getToken: GetToken,
) {
  return queryOptions({
    queryKey: ["project-overview", userId, projectId, "activity", endpointId],
    queryFn: endpointId
      ? async ({ signal }): Promise<Activity> => {
          const [latest, successful] = await Promise.all([
            apiRequest<Page<Delivery>>(
              projectPath(projectId, "deliveries"),
              getToken,
              { signal, params: { endpoint_id: endpointId, limit: 1 } },
            ),
            apiRequest<Page<Delivery>>(
              projectPath(projectId, "deliveries"),
              getToken,
              {
                signal,
                params: {
                  endpoint_id: endpointId,
                  state: "succeeded",
                  limit: 1,
                },
              },
            ),
          ]);
          return {
            latest: latest.data[0] ?? null,
            successful: successful.data[0] ?? null,
          };
        }
      : skipToken,
    ...freshness,
  });
}

export function overviewDeliveriesQuery(
  userId: string,
  projectId: string,
  getToken: GetToken,
) {
  return queryOptions({
    queryKey: ["deliveries", userId, projectId, "overview-recent"],
    queryFn: ({ signal }) =>
      apiRequest<Page<Delivery>>(
        projectPath(projectId, "deliveries"),
        getToken,
        { signal, params: { limit: 5 } },
      ),
    ...freshness,
  });
}

export function overviewEventsQuery(
  userId: string,
  projectId: string,
  getToken: GetToken,
) {
  return queryOptions({
    queryKey: ["events", userId, projectId, "overview-recent"],
    queryFn: ({ signal }) =>
      apiRequest<Page<EventSummary>>(
        projectPath(projectId, "events"),
        getToken,
        { signal, params: { limit: 5 } },
      ),
    ...freshness,
  });
}

export function overviewUsageQuery(
  userId: string,
  projectId: string,
  canManage: boolean,
  getToken: GetToken,
) {
  return queryOptions({
    queryKey: ["usage", userId, "project", projectId],
    queryFn: canManage
      ? ({ signal }) =>
          apiRequest<Usage>(projectPath(projectId, "usage"), getToken, {
            signal,
          })
      : skipToken,
    ...freshness,
  });
}
