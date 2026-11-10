"use client";

import { Button } from "@/components/button";

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
    <div data-ui={compact ? "notification-feed-compact" : undefined}>
      <div className="flex items-center flex-wrap justify-between min-h-13.5 border-b [border-bottom-style:solid] border-b-border gap-2 py-2.25 px-4.5">
        <span className="text-muted text-[12px]" aria-live="polite">
          {filters.state === "archived" ? "Archived" : filters.state === "read" ? "Read notifications"
            : unread === undefined ? "Your updates" : unread.toLocaleString("en-US") + " unread"}
        </span>
        <div className="flex items-center flex-wrap gap-2">
          {!compact && filters.state !== "archived" && filters.state !== "read" && (
            <Button type="button" data-ui="button" variant="quiet" size="small" className="leading-[1.4]"
              disabled={busy || !unread || inaccessible}
              title={filters.projectId || filters.category ? "Mark all unread notifications matching these filters as read" : "Mark all unread notifications in this organization as read"}
              onClick={() => actions.readAll.mutate()}>
              <CheckIcon size={15} aria-hidden="true" />{actions.readAll.isPending ? "Marking…" : "Mark all read"}
            </Button>
          )}
          <RefreshButton pending={feed.isFetching || count.isFetching} refresh={refresh} />
        </div>
      </div>
      {(feed.fetchStatus === "paused" || count.fetchStatus === "paused") && <p className="text-muted text-[12px] leading-[1.7] my-3.5 px-4.5" role="status">You are offline. Updates will resume when you reconnect.</p>}
      {error && (
        <div data-ui="notification-error" className="flex items-start rounded-md text-warning bg-warning-subtle text-[12px] gap-2.25 m-3 p-3 border border-solid border-border [&_strong]:font-medium [&_p]:mt-0.75 [&_p]:leading-[1.6]" role="alert">
          <WarningCircleIcon size={17} aria-hidden="true" />
          <div>
            <strong>{inaccessible ? "Notifications unavailable" : mutationError ? "Couldn't save this change" : feed.data ? "Couldn't refresh notifications" : "Couldn't load notifications"}</strong>
            <p>{error.message}</p>
            {!inaccessible && !mutationError && feed.data && <p>Showing the last loaded updates.</p>}
          </div>
          {(actions.update.error || actions.readAll.error) && <button type="button" className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent ml-auto text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]"
            onClick={() => { actions.update.reset(); actions.readAll.reset(); }}>Dismiss</button>}
        </div>
      )}
      <span className="sr-only" role="status">
        {actions.update.isSuccess ? actions.update.data.archived_at ? "Notification marked as read and moved to archive." : "Notification moved to inbox." : ""}
        {actions.readAll.isSuccess ? actions.readAll.data.updated + " notifications marked as read and moved to archive." : ""}
      </span>
      {inaccessible ? null : feed.isPending ? <NotificationListSkeleton rows={compact ? 3 : 6} /> : feed.data && (
        <>
          {items.length ? (
            <ul className="list-none m-0 p-0" aria-label={compact ? "Unread notifications" : "Notifications"}>
              {items.map((item) => <NotificationItem key={item.id} item={item} actions={actions}
                projectName={item.project_id ? projectNames?.get(item.project_id) : undefined} onNavigate={onNavigate} />)}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-65 text-center gap-2.5 py-8 px-6 [&_>_svg]:mb-1 [&_>_svg]:text-muted [&_h3]:text-[15px] [&_h3]:font-medium [&_p]:max-w-85 [&_p]:text-muted [&_p]:text-[12px] [&_p]:leading-[1.7]">
              <EmptyIcon size={28} weight="light" aria-hidden="true" />
              <h3>{emptyTitle}</h3>
              <p>{filters.projectId || filters.category ? "No updates match these filters. Try another category or project."
                : filters.state === "archived" ? "Notifications marked as read appear here. Move one back to the inbox to follow up."
                  : filters.state === "unread" ? "New updates for this organization will appear here."
                    : filters.state === "read" ? "Notifications marked as read are saved in your archive."
                      : "Delivery alerts, team changes, and other organization updates will appear here."}</p>
            </div>
          )}
          {!compact && <LoadMore query={feed} label="Load older notifications" />}
          {!compact && feed.data.pages.length > 1 && <p className="text-muted text-[12px] leading-[1.7] my-3.5 px-4.5">Browsing older updates. Refresh to include new activity.</p>}
        </>
      )}
    </div>
  );
}
