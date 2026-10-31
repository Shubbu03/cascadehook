"use client";

import { useAuth } from "@clerk/nextjs";
import { ArchiveIcon, BellSimpleIcon, CheckCircleIcon, CheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { LoadMore, RefreshButton } from "@/components/query-state";
import { useSessionUserId } from "@/features/workspace/session";
import { NotificationItem } from "./notification-item";
import { NotificationListSkeleton } from "./notification-skeleton";
import { notificationAccessLost, notificationCountQuery, notificationListQuery } from "./queries";
import type { NotificationFilters } from "./types";
import { useNotificationActions } from "./use-notification-actions";

export function NotificationFeed({ organizationId, filters, compact = false, projectNames, onNavigate }: {
  organizationId: string;
  filters: NotificationFilters;
  compact?: boolean;
  projectNames?: ReadonlyMap<string, string>;
  onNavigate?: () => void;
}) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const countFilters = { projectId: filters.projectId, category: filters.category };
  const feed = useInfiniteQuery(notificationListQuery(userId, organizationId, getToken, filters, compact ? 6 : 20));
  const count = useQuery(notificationCountQuery(userId, organizationId, getToken, countFilters));
  const organizationCount = useQuery(notificationCountQuery(userId, organizationId, getToken));
  const actions = useNotificationActions(organizationId, countFilters);
  const accessError = [organizationCount.error, feed.error, count.error].find(notificationAccessLost);
  const inaccessible = !!accessError;
  const mutationError = actions.update.error ?? actions.readAll.error;
  const error = accessError ?? mutationError ?? feed.error ?? count.error;
  // A mutation can change whether an item belongs in this cached view before its refetch finishes.
  const items = (feed.data?.pages.flatMap((page) => page.data) ?? []).filter((item) => {
    if (filters.state === "archived") return !!item.archived_at;
    if (item.archived_at) return false;
    return filters.state === "unread" ? !item.read_at : filters.state === "read" ? !!item.read_at : true;
  });
  const busy = actions.update.isPending || actions.readAll.isPending;
  const unread = count.isError ? undefined : count.data?.unread_count;
  const refresh = () => Promise.all([feed.refetch(), count.refetch(), ...(filters.projectId || filters.category ? [organizationCount.refetch()] : [])]);
  const emptyTitle = filters.state === "archived" ? "No archived notifications"
    : filters.state === "unread" ? "You're all caught up"
    : filters.state === "read" ? "No read notifications" : "No notifications yet";
  const EmptyIcon = filters.state === "archived" ? ArchiveIcon : filters.state === "unread" ? CheckCircleIcon : BellSimpleIcon;

  return (
    <div className={"notification-feed" + (compact ? " notification-feed-compact" : "")}>
      <div className="notification-feed-toolbar">
        <span className="notification-feed-status" aria-live="polite">
          {filters.state === "archived" ? "Archived" : filters.state === "read" ? "Read notifications"
            : unread === undefined ? "Your updates" : unread.toLocaleString("en-US") + " unread"}
        </span>
        <div className="notification-toolbar-actions">
          {filters.state !== "archived" && filters.state !== "read" && (
            <button type="button" className="button button-small button-quiet"
              disabled={busy || !unread || inaccessible}
              title={filters.projectId || filters.category ? "Mark all unread notifications matching these filters as read" : "Mark all unread notifications in this organization as read"}
              onClick={() => actions.readAll.mutate()}>
              <CheckIcon size={15} aria-hidden="true" />{actions.readAll.isPending ? "Marking…" : "Mark all read"}
            </button>
          )}
          <RefreshButton pending={feed.isFetching || count.isFetching} refresh={refresh} />
        </div>
      </div>
      {(feed.fetchStatus === "paused" || count.fetchStatus === "paused") && <p className="notification-offline" role="status">You are offline. Updates will resume when you reconnect.</p>}
      {error && (
        <div className="notification-error" role="alert">
          <WarningCircleIcon size={17} aria-hidden="true" />
          <div>
            <strong>{inaccessible ? "Notifications unavailable" : mutationError ? "Couldn't save this change" : feed.data ? "Couldn't refresh notifications" : "Couldn't load notifications"}</strong>
            <p>{error.message}</p>
            {!inaccessible && !mutationError && feed.data && <p>Showing the last loaded updates.</p>}
          </div>
          {(actions.update.error || actions.readAll.error) && <button type="button" className="text-link"
            onClick={() => { actions.update.reset(); actions.readAll.reset(); }}>Dismiss</button>}
        </div>
      )}
      <span className="sr-only" role="status">
        {actions.readAll.isSuccess ? actions.readAll.data.updated + " notifications marked as read." : ""}
      </span>
      {inaccessible ? null : feed.isPending ? <NotificationListSkeleton rows={compact ? 3 : 6} /> : feed.data && (
        <>
          {items.length ? (
            <ul className="notification-list" aria-label={compact ? "Recent notifications" : "Notifications"}>
              {items.map((item) => <NotificationItem key={item.id} item={item} actions={actions}
                projectName={item.project_id ? projectNames?.get(item.project_id) : undefined} onNavigate={onNavigate} />)}
            </ul>
          ) : (
            <div className="notification-empty">
              <EmptyIcon size={28} weight="light" aria-hidden="true" />
              <h3>{emptyTitle}</h3>
              <p>{filters.projectId || filters.category ? "No updates match these filters. Try another category or project."
                : filters.state === "archived" ? "Notifications you archive will appear here."
                : filters.state === "unread" ? "New updates for this organization will appear here."
                : filters.state === "read" ? "Opening or marking an update as read moves it here."
                : "Delivery alerts, team changes, and other organization updates will appear here."}</p>
            </div>
          )}
          {!compact && <LoadMore query={feed} label="Load older notifications" />}
          {!compact && feed.data.pages.length > 1 && <p className="notification-history-note">Browsing older updates. Refresh to include new activity.</p>}
        </>
      )}
    </div>
  );
}
