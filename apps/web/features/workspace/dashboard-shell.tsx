"use client";

import { UserButton } from "@clerk/nextjs";
import {
  CaretLeftIcon,
  CaretRightIcon,
  ListIcon,
  XIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Brand } from "@/components/brand";
import { Modal } from "@/components/modal";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { notificationAccessLost } from "@/features/notifications/queries";
import { SidebarNavigation } from "./sidebar-navigation";
import { useWorkspaceSelection } from "./use-workspace-selection";
import { WorkspaceNavigation } from "./workspace-navigation";

export function DashboardShell({ children }: { children: React.ReactNode; }) {
  const pathname = usePathname();
  const { projectId, project, organization } = useWorkspaceSelection();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  useEffect(() => {
    function toggleSidebar(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "b"
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
        )
      )
        return;
      if (
        document.querySelector(
          'dialog[open]:not([data-navigation]), [role="dialog"][aria-modal="true"]',
        )
      )
        return;
      event.preventDefault();
      if (window.matchMedia("(max-width: 900px)").matches) {
        setMobileOpen((open) => !open);
      } else {
        setCollapsed((collapsed) => !collapsed);
      }
    }
    window.addEventListener("keydown", toggleSidebar);
    return () => window.removeEventListener("keydown", toggleSidebar);
  }, []);
  const navigation = {
    projectId,
    organizationId: organization.data?.id,
    role: project.data?.role ?? organization.data?.role,
    pathname,
  };

  return (
    <div data-ui="dashboard-shell" className={"[--sidebar-width:224px] [--topbar-height:60px] grid grid-cols-[var(--sidebar-width)_minmax(0,1fr)] min-h-svh items-start data-[collapsed=true]:[--sidebar-width:68px] max-[56.25rem]:grid-cols-[minmax(0,1fr)]"} data-collapsed={collapsed}>
      <aside data-ui="dashboard-sidebar" className="sticky top-0 flex flex-col h-dvh min-w-0 border-r [border-right-style:solid] border-r-border bg-surface max-[56.25rem]:hidden" aria-label="Sidebar">
        <div data-ui="sidebar-brand" className={"flex items-center justify-between shrink-0 min-h-(--topbar-height,60px) gap-2.5 px-4 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0"}>
          <Brand />
        </div>
        <SidebarNavigation {...navigation} />
        <div className="shrink-0 border-t [border-top-style:solid] border-t-border p-3">
          <Link
            href="/account"
            className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-[13px]/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"}
            aria-label="Account settings"
            title="Account settings"
            aria-current={pathname === "/account" ? "page" : undefined}
          >
            <UserCircleIcon size={18} aria-hidden="true" />
            <span>Account settings</span>
          </Link>
          <button
            className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-xs/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"}
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={
              (collapsed ? "Expand sidebar" : "Collapse sidebar") +
              " (Cmd/Ctrl+B)"
            }
            aria-keyshortcuts="Meta+B Control+B"
            onClick={() => setCollapsed((collapsed) => !collapsed)}
          >
            {collapsed ? (
              <CaretRightIcon size={18} aria-hidden="true" />
            ) : (
              <CaretLeftIcon size={18} aria-hidden="true" />
            )}
            <span>Collapse sidebar</span>
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header data-ui="dashboard-topbar" className="sticky z-30 top-0 flex items-center h-(--topbar-height) border-b [border-bottom-style:solid] border-b-border bg-background px-6 gap-3.5 max-[56.25rem]:px-4 max-[56.25rem]:gap-2.5">
          <button
            type="button"
            className="hidden items-center justify-center shrink-0 rounded-md bg-transparent text-muted p-0 size-8.5 border-0 border-none border-current [&:hover]:text-foreground [&:hover]:bg-surface-hover in-data-[ui~='dashboard-navigation-dialog']:inline-flex max-[56.25rem]:inline-flex pointer-coarse:min-h-11"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-keyshortcuts="Meta+B Control+B"
            onClick={() => setMobileOpen(true)}
          >
            <ListIcon size={21} aria-hidden="true" />
          </button>
          <WorkspaceNavigation />
          <div className="flex items-center shrink-0 ml-auto gap-3.5 max-[37.5rem]:gap-2.5">
            {organization.data && !notificationAccessLost(organization.error) && (
              <NotificationBell key={organization.data.id} organization={organization.data} />
            )}
            <div className="max-[37.5rem]:hidden">
              <ThemeSwitcher />
            </div>
            <UserButton />
          </div>
        </header>
        <div className="min-w-0">{children}</div>
      </div>
      {mobileOpen && (
        <MobileNavigation onClose={closeMobile}>
          <SidebarNavigation {...navigation} onNavigate={closeMobile} />
        </MobileNavigation>
      )}
    </div>
  );
}

function MobileNavigation({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const id = useId();
  useEffect(() => {
    const overflow = document.body.style.overflow;
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("popstate", onClose);
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("popstate", onClose);
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [onClose]);

  return (
    <Modal
      data-navigation=""
      data-ui="dashboard-navigation-dialog" className="fixed right-auto left-0 hidden w-[min(280px,calc(100vw-40px))] max-w-none h-dvh max-h-none [border-top-style:none] border-r [border-right-style:solid] border-r-border [border-bottom-style:none] border-l-0 [border-left-style:none] border-l-[currentColor] rounded-none bg-surface text-foreground m-0 p-0 inset-y-0 border-y-0 border-y-[currentColor] [[open]]:flex [[open]]:flex-col backdrop:bg-[#0008]"
      aria-labelledby={id}
      onDismiss={onClose}
      onClick={(event) => {
        if ((event.target as Element).closest("a")) {
          onClose();
        }
      }}
    >
      <h2 id={id} className="sr-only">
        Workspace navigation
      </h2>
      <div data-ui="sidebar-brand" className={"flex items-center justify-between shrink-0 min-h-(--topbar-height,60px) gap-2.5 px-4 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0"}>
        <Brand />
        <button
          type="button"
          className="items-center justify-center shrink-0 rounded-md bg-transparent text-muted p-0 size-8.5 border-0 border-none border-current [&:hover]:text-foreground [&:hover]:bg-surface-hover inline-flex max-[56.25rem]:inline-flex pointer-coarse:min-h-11"
          aria-label="Close navigation"
          onClick={onClose}
        >
          <XIcon size={20} aria-hidden="true" />
        </button>
      </div>
      {children}
      <div className="shrink-0 border-t [border-top-style:solid] border-t-border p-3">
        <Link href="/account" className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-[13px]/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"} onNavigate={onClose}>
          <UserCircleIcon size={18} aria-hidden="true" />
          <span>Account settings</span>
        </Link>
      </div>
      <div className="shrink-0 border-t [border-top-style:solid] border-t-border flex items-center justify-between text-muted text-[12px] py-3 px-5.5">
        <span>Appearance</span>
        <ThemeSwitcher />
      </div>
    </Modal>
  );
}
