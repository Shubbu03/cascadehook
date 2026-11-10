"use client";

import {
  ArrowCounterClockwiseIcon, ChartBarIcon, CheckCircleIcon,
  CheckIcon, FolderSimpleIcon, KeyIcon, LightningIcon, ShieldCheckIcon, UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useFormatTime } from "@/lib/display-preferences";
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
  const formatTime = useFormatTime();
  const Icon = categoryIcons[item.category] ?? LightningIcon;
  const href = notificationTarget(item);
  const pending = actions.update.isPending || actions.readAll.isPending;
  const title = (
    <>
      {!item.read_at && <span className="inline-block mt-0 mr-1.75 mb-0.5 ml-0 rounded-full bg-accent size-1.5"><span className="sr-only">Unread: </span></span>}
      {item.title}
    </>
  );
  return (
    <li className={"flex items-start border-b [border-bottom-style:solid] border-b-border gap-3 p-5 last:border-b-0 last:[border-bottom-style:none] last:border-b-[currentColor] data-[unread=\"true\"]:bg-[color-mix(in_srgb,var(--accent-subtle)_20%,transparent)] in-data-[ui~='notification-feed-compact']:grid in-data-[ui~='notification-feed-compact']:grid-cols-[28px_minmax(0,1fr)_28px] in-data-[ui~='notification-feed-compact']:gap-2.5 in-data-[ui~='notification-feed-compact']:py-3.75 in-data-[ui~='notification-feed-compact']:px-4.5 max-[37.5rem]:grid max-[37.5rem]:grid-cols-[28px_minmax(0,1fr)] max-[37.5rem]:gap-2.5 max-[37.5rem]:p-4 pointer-coarse:in-data-[ui~='notification-feed-compact']:grid-cols-[28px_minmax(0,1fr)_44px]"} data-unread={!item.read_at}>
      <span className={"grid place-items-center shrink-0 rounded-[7px] bg-background text-muted size-8 border border-solid border-border data-[severity=\"warning\"]:text-warning data-[severity=\"warning\"]:bg-warning-subtle data-[severity=\"warning\"]:border-transparent data-[severity=\"error\"]:text-danger data-[severity=\"error\"]:bg-danger-subtle data-[severity=\"error\"]:border-transparent data-[severity=\"success\"]:text-success data-[severity=\"success\"]:bg-success-subtle data-[severity=\"success\"]:border-transparent in-data-[ui~='notification-feed-compact']:size-7"} data-severity={item.resolved_at ? "success" : item.severity}>
        <Icon size={18} aria-hidden="true" />
        <span className="sr-only">{item.severity}: </span>
      </span>
      <div className="flex-1 min-w-0 wrap-anywhere [&_h3]:text-[14px] [&_h3]:font-medium [&_h3]:leading-[1.55] [&_h3_a]:text-inherit [[data-ui~='notification-feed-compact']_&_h3]:text-[12px] [&_h3_a:hover]:text-accent [&_h3_a:hover]:underline [&_h3_a:hover]:underline-offset-[3px]">
        <h3>
          {href ? (
            <Link href={href} onClick={() => {
              if (!item.read_at) actions.update.mutate({ id: item.id, read: true });
            }} onNavigate={onNavigate}>{title}</Link>
          ) : title}
        </h3>
        <p className="mt-1 text-muted text-[13px] leading-[1.65] in-data-[ui~='notification-feed-compact']:text-[12px]">{item.body}</p>
        <div className="flex items-center flex-wrap gap-y-1 gap-x-3 mt-2.25 text-muted text-[11px] leading-[1.6]">
          <span>{notificationCategories[item.category]}</span>
          <time dateTime={item.created_at}>{formatTime(item.created_at)}</time>
          <span title={item.project_id ?? undefined}>
            {item.project_id ? projectName ?? "Project " + item.project_id.slice(0, 8) : "Organization"}
          </span>
          {item.occurrence_count > 1 && <span>{item.occurrence_count.toLocaleString("en-US")} occurrences</span>}
          {item.resolved_at && (
            <span className="inline-flex items-center text-success gap-1" title={"Resolved " + formatTime(item.resolved_at)}>
              <CheckCircleIcon size={13} aria-hidden="true" />Resolved
            </span>
          )}
          {!href && <span>Resource unavailable</span>}
        </div>
      </div>
      <div className="flex -mt-1 gap-0.5 in-data-[ui~='notification-feed-compact']:flex-col in-data-[ui~='notification-feed-compact']:-mt-0.5 in-data-[ui~='notification-feed-compact']:gap-1 max-[37.5rem]:col-2 max-[37.5rem]:mt-0 max-[37.5rem]:in-data-[ui~='notification-feed-compact']:col-auto">
        <button type="button" className="inline-flex items-center justify-center shrink-0 rounded-md bg-transparent text-muted p-0 size-8.5 border-0 border-none border-current [&:hover]:bg-surface-hover [&:hover]:text-foreground in-data-[ui~='notification-feed-compact']:size-7 pointer-coarse:size-11 pointer-coarse:in-data-[ui~='notification-feed-compact']:size-11"
          title={item.archived_at ? "Move to inbox" : "Mark as read"}
          aria-label={(item.archived_at ? "Move to inbox: " : "Mark as read: ") + item.title}
          disabled={pending}
          onClick={() => actions.update.mutate({ id: item.id, read: !item.archived_at })}>
          {item.archived_at ? <ArrowCounterClockwiseIcon size={16} aria-hidden="true" /> : <CheckIcon size={16} aria-hidden="true" />}
        </button>
      </div>
    </li>
  );
}
