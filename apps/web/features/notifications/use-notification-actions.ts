"use client";

import { useAuth } from "@clerk/nextjs";
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type { Page } from "@/features/workspace/types";
import { useSessionUserId } from "@/features/workspace/session";
import { ApiError, apiRequest } from "@/lib/api";
import {
  checkNotificationCooldown,
  notificationParams,
  notificationPath,
  notificationScope,
} from "./queries";
import type { InboxNotification, NotificationFilters } from "./types";

type Update = { id: string; read?: boolean; archived?: boolean };

export function useNotificationActions(
  organizationId: string,
  filters: Omit<NotificationFilters, "state"> = {},
) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const scope = notificationScope(userId, organizationId);
  const refresh = () => client.invalidateQueries({ queryKey: scope });
  const settled = (_data: unknown, error: Error | null) => {
    if (error instanceof ApiError && error.status === 429) return;
    return refresh();
  };
  const update = useMutation({
    mutationKey: [...scope, "update"],
    mutationFn: ({ id, ...data }: Update) => {
      checkNotificationCooldown(client, userId, organizationId);
      return apiRequest<InboxNotification>(
        notificationPath(organizationId) + "/" + encodeURIComponent(id),
        getToken,
        { method: "PATCH", data },
      );
    },
    onSuccess: (item) => {
      // Patch every cached view before revalidating counts and pagination.
      client.setQueriesData<InfiniteData<Page<InboxNotification>>>(
        { queryKey: [...scope, "list"] },
        (data) => data && ({
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            data: page.data.map((current) => current.id === item.id ? item : current),
          })),
        }),
      );
    },
    onSettled: settled,
  });
  const readAll = useMutation({
    mutationKey: [...scope, "read-all"],
    mutationFn: () => {
      checkNotificationCooldown(client, userId, organizationId);
      return apiRequest<{ updated: number }>(
        notificationPath(organizationId) + "/read-all",
        getToken,
        { method: "POST", params: notificationParams(filters) },
      );
    },
    onSettled: settled,
  });
  return { update, readAll, refresh };
}

export type NotificationActions = ReturnType<typeof useNotificationActions>;
