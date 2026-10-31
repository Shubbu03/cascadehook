import {
  infiniteQueryOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api";
import type { Page } from "@/features/workspace/types";
import type { InboxNotification, NotificationFilters } from "./types";

type GetToken = () => Promise<string | null>;
export const notificationScope = (userId: string, organizationId: string) =>
  ["notification-inbox", userId, organizationId] as const;

export function notificationPath(organizationId: string) {
  return (
    "/v1/organizations/" + encodeURIComponent(organizationId) + "/notifications"
  );
}

export function notificationParams(filters: Omit<NotificationFilters, "state">) {
  return {
    ...(filters.projectId ? { project_id: filters.projectId } : {}),
    ...(filters.category ? { category: filters.category } : {}),
  };
}

export function notificationAccessLost(error: Error | null) {
  return error instanceof ApiError && [401, 403, 404, 410].includes(error.status);
}

function canRefresh(error: Error | null) {
  return !(error instanceof ApiError && error.retryAt > Date.now());
}

function pollInterval(error: Error | null) {
  if (notificationAccessLost(error)) return false;
  return error instanceof ApiError
    ? Math.max(60_000, error.retryAt - Date.now())
    : error ? 60_000 : 30_000;
}

export function checkNotificationCooldown(
  client: QueryClient,
  userId: string,
  organizationId: string,
) {
  const scope = notificationScope(userId, organizationId);
  const errors = [
    ...client.getQueryCache().findAll({ queryKey: scope })
      .map((query) => query.state.error),
    ...client.getMutationCache().findAll({ mutationKey: scope })
      .map((mutation) => mutation.state.error),
  ];
  const limited = errors.find(
    (error) => error instanceof ApiError && error.retryAt > Date.now(),
  );
  if (limited) throw limited;
}

export function notificationListQuery(
  userId: string,
  organizationId: string,
  getToken: GetToken,
  filters: NotificationFilters,
  limit = 20,
) {
  return infiniteQueryOptions({
    queryKey: [
      ...notificationScope(userId, organizationId), "list", { ...filters, limit },
    ],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal, client }) => {
      checkNotificationCooldown(client, userId, organizationId);
      return apiRequest<Page<InboxNotification>>(
        notificationPath(organizationId),
        getToken,
        {
          signal,
          params: {
            ...notificationParams(filters),
            state: filters.state,
            limit,
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
      );
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: 15_000,
    retry: false,
    refetchInterval: (query) =>
      (query.state.data?.pages.length ?? 0) > 1
        ? false : pollInterval(query.state.error),
    refetchOnWindowFocus: (query) => canRefresh(query.state.error),
    refetchOnReconnect: (query) => canRefresh(query.state.error),
    refetchOnMount: (query) => canRefresh(query.state.error),
    refetchIntervalInBackground: false,
  });
}

export function notificationCountQuery(
  userId: string,
  organizationId: string,
  getToken: GetToken,
  filters: Omit<NotificationFilters, "state"> = {},
) {
  return queryOptions({
    queryKey: [...notificationScope(userId, organizationId), "count", filters],
    queryFn: ({ signal, client }) => {
      checkNotificationCooldown(client, userId, organizationId);
      return apiRequest<{ unread_count: number }>(
        notificationPath(organizationId) + "/unread-count",
        getToken,
        { signal, params: notificationParams(filters) },
      );
    },
    staleTime: 15_000,
    retry: false,
    refetchInterval: (query) => pollInterval(query.state.error),
    refetchOnWindowFocus: (query) => canRefresh(query.state.error),
    refetchOnReconnect: (query) => canRefresh(query.state.error),
    refetchOnMount: (query) => canRefresh(query.state.error),
    refetchIntervalInBackground: false,
  });
}
