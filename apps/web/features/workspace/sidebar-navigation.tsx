"use client";

import {
  BookOpenIcon,
  BellSimpleIcon,
  ChartBarIcon,
  FolderSimpleIcon,
  GearSixIcon,
  KeyIcon,
  LifebuoyIcon,
  LightningIcon,
  ListChecksIcon,
  PlugsConnectedIcon,
  RocketLaunchIcon,
  SquaresFourIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { DocsLink } from "@/components/docs-link";
import type { OrganizationRole } from "./types";
import { organizationHref } from "./queries";
import { notificationInboxHref } from "@/features/notifications/types";

const groups = [
  {
    label: "Activity",
    links: [
      { path: "", label: "Overview", Icon: SquaresFourIcon, privileged: false },
      {
        path: "deliveries",
        label: "Deliveries",
        Icon: ListChecksIcon,
        privileged: false,
      },
      {
        path: "events",
        label: "Events",
        Icon: LightningIcon,
        privileged: false,
      },
    ],
  },
  {
    label: "Configuration",
    links: [
      {
        path: "endpoints",
        label: "Endpoints",
        Icon: PlugsConnectedIcon,
        privileged: false,
      },
      { path: "api-keys", label: "API keys", Icon: KeyIcon, privileged: true },
    ],
  },
  {
    label: "Manage",
    links: [
      { path: "usage", label: "Usage", Icon: ChartBarIcon, privileged: true },
      {
        path: "settings",
        label: "Settings",
        Icon: GearSixIcon,
        privileged: false,
      },
    ],
  },
];

export function SidebarNavigation({
  projectId,
  organizationId,
  role,
  pathname,
  onNavigate,
}: {
  projectId?: string;
  organizationId?: string;
  role?: OrganizationRole;
  pathname: string;
  onNavigate?: () => void;
}) {
  const href = projectId
    ? "/dashboard/projects/" + encodeURIComponent(projectId)
    : "";
  const canManage = role === "owner" || role === "admin";
  const notificationsLink = organizationId && (
    <Link
      href={notificationInboxHref(organizationId)}
      className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-[13px]/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"}
      aria-label="Notifications"
      title="Notifications"
      aria-current={
        pathname === notificationInboxHref(organizationId) ? "page" : undefined
      }
      onNavigate={onNavigate}
    >
      <BellSimpleIcon size={18} aria-hidden="true" />
      <span>Notifications</span>
    </Link>
  );
  return (
    <nav className="flex flex-col flex-1 min-h-0 overflow-y-auto py-4 px-3 [&_ul]:grid [&_ul]:list-none [&_ul]:gap-2 [&_ul]:m-0 [&_ul]:p-0" aria-label="Main navigation">
      {projectId ? (
        groups.map((group) => (
          <div data-ui="sidebar-group" className="[[data-ui~='sidebar-group']+&]:mt-6" key={group.label}>
            <p className={"mt-0 mb-2 text-muted text-[11px] mx-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:hidden"}>{group.label}</p>
            <ul role="list">
              {group.links
                .filter((link) => !link.privileged || canManage)
                .map(({ path, label, Icon }) => (
                  <li key={path}>
                    <Link
                      href={path ? href + "/" + path : href}
                      className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-[13px]/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"}
                      aria-label={label}
                      title={label}
                      aria-current={
                        pathname === (path ? href + "/" + path : href) ||
                          (path !== "" &&
                            pathname.startsWith(href + "/" + path + "/"))
                          ? "page"
                          : undefined
                      }
                      onNavigate={onNavigate}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))
      ) : (
        <div data-ui="sidebar-group" className="[[data-ui~='sidebar-group']+&]:mt-6">
          <p className={"mt-0 mb-2 text-muted text-[11px] mx-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:hidden"}>Workspace</p>
          <ul role="list">
            <li>
              <Link
                href={
                  organizationId
                    ? organizationHref(organizationId)
                    : "/dashboard"
                }
                className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-[13px]/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"}
                aria-label="Projects"
                title="Projects"
                aria-current={pathname === "/dashboard" ? "page" : undefined}
                onNavigate={onNavigate}
              >
                <FolderSimpleIcon size={18} aria-hidden="true" />
                <span>Projects</span>
              </Link>
            </li>
            {notificationsLink && <li>{notificationsLink}</li>}
            {organizationId && (
              <li>
                <Link
                  href={
                    "/dashboard/organizations/" +
                    encodeURIComponent(organizationId) +
                    "/settings"
                  }
                  className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-[13px]/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"}
                  aria-label="Organization and team"
                  title="Organization and team"
                  aria-current={
                    pathname ===
                      "/dashboard/organizations/" +
                      encodeURIComponent(organizationId) +
                      "/settings"
                      ? "page"
                      : undefined
                  }
                  onNavigate={onNavigate}
                >
                  <UsersIcon size={18} aria-hidden="true" />
                  <span>Organization &amp; team</span>
                </Link>
              </li>
            )}
            {organizationId && canManage && (
              <li>
                <Link
                  href={
                    "/dashboard/organizations/" +
                    encodeURIComponent(organizationId) +
                    "/usage"
                  }
                  className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-[13px]/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"}
                  aria-label="Organization usage"
                  title="Organization usage"
                  aria-current={
                    pathname ===
                      "/dashboard/organizations/" +
                      encodeURIComponent(organizationId) +
                      "/usage"
                      ? "page"
                      : undefined
                  }
                  onNavigate={onNavigate}
                >
                  <ChartBarIcon size={18} aria-hidden="true" />
                  <span>Usage</span>
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
      {projectId && notificationsLink && (
        <div data-ui="sidebar-group" className="[[data-ui~='sidebar-group']+&]:mt-6">
          <p className={"mt-0 mb-2 text-muted text-[11px] mx-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:hidden"}>Organization</p>
          {notificationsLink}
        </div>
      )}
      <div className="mt-auto pt-8">
        <DocsLink
          path="/docs/quickstart"
          className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-[13px]/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"}
          aria-label="Quickstart"
          title="Quickstart"
          onClick={onNavigate}
        >
          <RocketLaunchIcon size={18} aria-hidden="true" />
          <span>Quickstart</span>
        </DocsLink>
        {projectId && (
          <DocsLink
            path="/docs/receivers"
            className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-[13px]/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"}
            aria-label="Receiver guide"
            title="Receiver guide"
            onClick={onNavigate}
          >
            <BookOpenIcon size={18} aria-hidden="true" />
            <span>Receiver guide</span>
          </DocsLink>
        )}
        <Link href="/support" className={"relative flex items-center w-full min-h-10 rounded-md bg-transparent text-muted text-left whitespace-nowrap [transition:background-color_0.12s,color_0.12s] p-2.5 gap-3 border-0 border-none border-current text-[13px]/5 [&:hover]:text-foreground [&:hover]:bg-surface-hover aria-[current]:text-accent aria-[current]:bg-[color-mix(in_srgb,var(--accent-subtle)_65%,transparent)] aria-[current]:font-medium [&[aria-current]::before]:absolute [&[aria-current]::before]:left-0 [&[aria-current]::before]:w-0.5 [&[aria-current]::before]:rounded-xs [&[aria-current]::before]:bg-accent [&[aria-current]::before]:content-[''] [&[aria-current]::before]:inset-y-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:justify-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:px-0 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span]:hidden pointer-coarse:min-h-11 motion-reduce:transition-none"} aria-label="Support" title="Support" onClick={onNavigate}>
          <LifebuoyIcon size={18} aria-hidden="true" />
          <span>Support</span>
        </Link>
      </div>
    </nav>
  );
}
