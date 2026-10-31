"use client";

import { useAuth } from "@clerk/nextjs";
import { ArrowRightIcon, BellSimpleIcon, XIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useSessionUserId } from "@/features/workspace/session";
import type { Organization } from "@/features/workspace/types";
import { NotificationFeed } from "./notification-feed";
import { notificationAccessLost, notificationCountQuery, notificationScope } from "./queries";
import { notificationInboxHref } from "./types";

export function NotificationBell({ organization }: { organization: Organization }) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const count = useQuery(notificationCountQuery(userId, organization.id, getToken));
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"all" | "unread">("all");
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const close = () => panel.current?.hidePopover();
  useEffect(() => { panel.current?.hidePopover(); }, [pathname]);
  useEffect(() => {
    const previousOrganizations = {
      queryKey: ["notification-inbox", userId],
      predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[2] !== organization.id,
    };
    void client.cancelQueries(previousOrganizations);
    client.removeQueries(previousOrganizations);
  }, [client, organization.id, userId]);
  useEffect(() => {
    if (!notificationAccessLost(count.error)) return;
    client.removeQueries({ queryKey: notificationScope(userId, organization.id), type: "inactive" });
  }, [client, count.error, organization.id, userId]);
  const unread = count.isError ? undefined : count.data?.unread_count;
  const label = count.isError ? "Notifications, couldn't refresh unread count"
    : unread === undefined ? "Notifications, loading unread count"
    : "Notifications, " + unread + " unread in " + organization.name;
  return (
    <>
      <button type="button" className="notification-bell" popoverTarget={id}
        aria-label={label} aria-expanded={open} aria-controls={id} title="Notifications">
        <BellSimpleIcon size={21} weight={open ? "fill" : "regular"} aria-hidden="true" />
        {unread !== undefined && unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
        {count.isError && <span className="notification-count notification-count-error" aria-hidden="true">!</span>}
      </button>
      <div ref={panel} id={id} popover="auto" className="notification-popover" role="dialog"
        aria-labelledby={id + "-heading"} aria-describedby={id + "-organization"}
        onToggle={(event) => setOpen(event.newState === "open")}>
        <header className="notification-popover-header">
          <div><h2 id={id + "-heading"}>Notifications</h2><p id={id + "-organization"}>{organization.name}</p></div>
          <button type="button" className="notification-icon-button" aria-label="Close notifications" onClick={close}><XIcon size={18} aria-hidden="true" /></button>
        </header>
        <div className="notification-tabs notification-popover-tabs" role="group" aria-label="Recent notification filter">
          <button type="button" aria-pressed={state === "all"} onClick={() => setState("all")}>All</button>
          <button type="button" aria-pressed={state === "unread"} onClick={() => setState("unread")}>Unread</button>
        </div>
        {open && <div className="notification-popover-scroll">
          <NotificationFeed key={state} organizationId={organization.id} filters={{ state }} compact onNavigate={close} />
        </div>}
        <Link className="notification-popover-footer" href={notificationInboxHref(organization.id)} onNavigate={close}>
          View all notifications<ArrowRightIcon size={16} aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}
