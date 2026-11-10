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

export function NotificationBell({ organization }: { organization: Organization; }) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const count = useQuery(notificationCountQuery(userId, organization.id, getToken));
  const [open, setOpen] = useState(false);
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const close = () => panel.current?.hidePopover();
  useEffect(() => { panel.current?.hidePopover(); }, [pathname]);
  useEffect(() => {
    const previousOrganizations = {
      queryKey: ["notification-inbox", userId],
      predicate: (query: { queryKey: readonly unknown[]; }) => query.queryKey[2] !== organization.id,
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
      <button type="button" className="inline-flex items-center justify-center shrink-0 rounded-md bg-transparent text-muted relative p-0 size-8.5 border-0 border-none border-current [&:hover]:bg-surface-hover [&:hover]:text-foreground aria-expanded:bg-surface-hover aria-expanded:text-foreground pointer-coarse:size-11" popoverTarget={id}
        aria-label={label} aria-expanded={open} aria-controls={id} title="Notifications">
        <BellSimpleIcon size={21} weight={open ? "fill" : "regular"} aria-hidden="true" />
        {unread !== undefined && unread > 0 && <span className="absolute -top-0.75 -right-1.25 grid place-items-center min-w-4.5 h-4.5 rounded-[20px] bg-accent text-accent-foreground text-[9px] font-semibold leading-none tabular-nums px-1 border-2 border-solid border-background" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
        {count.isError && <span className="absolute -top-0.75 -right-1.25 grid place-items-center min-w-4.5 h-4.5 rounded-[20px] bg-warning-subtle text-warning text-[9px] font-semibold leading-none tabular-nums px-1 border-2 border-solid border-background" aria-hidden="true">!</span>}
      </button>
      <div ref={panel} id={id} popover="auto" className="fixed top-[calc(var(--topbar-height,60px)+8px)] right-5 bottom-auto left-auto w-115 max-w-[calc(100vw-24px)] max-h-[calc(100dvh-var(--topbar-height,60px)-24px)] overflow-hidden rounded-[10px] bg-surface text-foreground shadow-floating m-0 p-0 border border-solid border-border [&:popover-open]:flex [&:popover-open]:flex-col max-[37.5rem]:right-3" role="dialog"
        aria-labelledby={id + "-heading"} aria-describedby={id + "-organization"}
        onToggle={(event) => setOpen(event.newState === "open")}>
        <header className="flex items-start justify-between pt-4.5 pb-2.5 gap-3 px-4.5 [&_>_div]:min-w-0 [&_h2]:text-[16px] [&_h2]:font-semibold [&_p]:mt-0.75 [&_p]:text-muted [&_p]:text-[12px] [&_p]:truncate">
          <div><h2 id={id + "-heading"}>Notifications</h2><p id={id + "-organization"}>{organization.name}</p></div>
          <button type="button" className="inline-flex items-center justify-center shrink-0 rounded-md bg-transparent text-muted p-0 size-8.5 border-0 border-none border-current [&:hover]:bg-surface-hover [&:hover]:text-foreground pointer-coarse:size-11" aria-label="Close notifications" onClick={close}><XIcon size={18} aria-hidden="true" /></button>
        </header>
        {open && <div className="min-h-0 overflow-y-auto overscroll-contain">
          <NotificationFeed organizationId={organization.id} filters={{ state: "unread" }} compact onNavigate={close} />
        </div>}
        <Link className="flex items-center justify-between shrink-0 border-t [border-top-style:solid] border-t-border text-accent text-[13px] font-medium gap-3 py-3.25 px-4.5 [&:hover]:bg-surface-hover" href={notificationInboxHref(organization.id)} onNavigate={close}>
          Manage notifications<ArrowRightIcon size={16} aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}
