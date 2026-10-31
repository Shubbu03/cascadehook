"use client";

import {
  ArchiveIcon, ArrowCounterClockwiseIcon, ChartBarIcon, CheckCircleIcon,
  CheckIcon, FolderSimpleIcon, KeyIcon, LightningIcon, ShieldCheckIcon, UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { formatTime } from "@/lib/format";
import { notificationCategories, notificationTarget, type InboxNotification } from "./types";
import type { NotificationActions } from "./use-notification-actions";

const categoryIcons = {
  delivery: LightningIcon, credentials: KeyIcon, usage: ChartBarIcon,
  team: UsersIcon, access: ShieldCheckIcon, project: FolderSimpleIcon,
};

export function NotificationItem({ item, actions, projectName, onNavigate }: {
  item: InboxNotification;
  actions: NotificationActions;
  projectName?: string;
  onNavigate?: () => void;
}) {
  const Icon = categoryIcons[item.category] ?? LightningIcon;
  const href = notificationTarget(item);
  const pending = actions.update.isPending || actions.readAll.isPending;
  const title = (
    <>
      {!item.read_at && <span className="notification-unread-dot"><span className="sr-only">Unread: </span></span>}
      {item.title}
    </>
  );
  return (
    <li className="notification-item" data-unread={!item.read_at}>
      <span className="notification-category-icon" data-severity={item.resolved_at ? "success" : item.severity}>
        <Icon size={18} aria-hidden="true" />
        <span className="sr-only">{item.severity}: </span>
      </span>
      <div className="notification-copy">
        <h3>
          {href ? (
            <Link href={href} onClick={() => {
              if (!item.read_at) actions.update.mutate({ id: item.id, read: true });
            }} onNavigate={onNavigate}>{title}</Link>
          ) : title}
        </h3>
        <p className="notification-body">{item.body}</p>
        <div className="notification-meta">
          <span>{notificationCategories[item.category]}</span>
          <time dateTime={item.created_at}>{formatTime(item.created_at)}</time>
          <span title={item.project_id ?? undefined}>
            {item.project_id ? projectName ?? "Project " + item.project_id.slice(0, 8) : "Organization"}
          </span>
          {item.occurrence_count > 1 && <span>{item.occurrence_count.toLocaleString("en-US")} occurrences</span>}
          {item.resolved_at && (
            <span className="notification-resolved" title={"Resolved " + formatTime(item.resolved_at)}>
              <CheckCircleIcon size={13} aria-hidden="true" />Resolved
            </span>
          )}
          {!href && <span>Resource unavailable</span>}
        </div>
      </div>
      <div className="notification-item-actions">
        <button type="button" className="notification-icon-button"
          title={item.read_at ? "Mark as unread" : "Mark as read"}
          aria-label={(item.read_at ? "Mark as unread: " : "Mark as read: ") + item.title}
          disabled={pending}
          onClick={() => actions.update.mutate({ id: item.id, read: !item.read_at })}>
          {item.read_at ? <span className="notification-mark-unread" aria-hidden="true" /> : <CheckIcon size={16} aria-hidden="true" />}
        </button>
        <button type="button" className="notification-icon-button"
          title={item.archived_at ? "Restore to inbox" : "Archive"}
          aria-label={(item.archived_at ? "Restore to inbox: " : "Archive: ") + item.title}
          disabled={pending}
          onClick={() => actions.update.mutate({ id: item.id, archived: !item.archived_at })}>
          {item.archived_at ? <ArrowCounterClockwiseIcon size={16} aria-hidden="true" /> : <ArchiveIcon size={16} aria-hidden="true" />}
        </button>
      </div>
    </li>
  );
}
