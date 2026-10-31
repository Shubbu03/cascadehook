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

export function DashboardShell({ children }: { children: React.ReactNode }) {
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
          'dialog[open]:not(.dashboard-navigation-dialog), [role="dialog"][aria-modal="true"]',
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
    <div className="dashboard-shell" data-collapsed={collapsed}>
      <aside className="dashboard-sidebar" aria-label="Sidebar">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <SidebarNavigation {...navigation} />
        <div className="sidebar-footer">
          <Link
            href="/account"
            className="sidebar-link"
            aria-label="Account settings"
            title="Account settings"
            aria-current={pathname === "/account" ? "page" : undefined}
          >
            <UserCircleIcon size={18} aria-hidden="true" />
            <span>Account settings</span>
          </Link>
          <button
            className="sidebar-link sidebar-collapse"
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
      <div className="dashboard-frame">
        <header className="dashboard-topbar">
          <button
            type="button"
            className="dashboard-menu-button"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-keyshortcuts="Meta+B Control+B"
            onClick={() => setMobileOpen(true)}
          >
            <ListIcon size={21} aria-hidden="true" />
          </button>
          <WorkspaceNavigation />
          <div className="dashboard-account">
            {organization.data && !notificationAccessLost(organization.error) && (
              <NotificationBell key={organization.data.id} organization={organization.data} />
            )}
            <div className="desktop-theme">
              <ThemeSwitcher />
            </div>
            <UserButton />
          </div>
        </header>
        <div className="dashboard-content">{children}</div>
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
      className="dashboard-navigation-dialog"
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
      <div className="sidebar-brand">
        <Brand />
        <button
          type="button"
          className="dashboard-menu-button"
          aria-label="Close navigation"
          onClick={onClose}
        >
          <XIcon size={20} aria-hidden="true" />
        </button>
      </div>
      {children}
      <div className="sidebar-footer">
        <Link href="/account" className="sidebar-link" onNavigate={onClose}>
          <UserCircleIcon size={18} aria-hidden="true" />
          <span>Account settings</span>
        </Link>
      </div>
      <div className="sidebar-footer mobile-theme">
        <span>Appearance</span>
        <ThemeSwitcher />
      </div>
    </Modal>
  );
}
