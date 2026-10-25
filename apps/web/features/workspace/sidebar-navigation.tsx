"use client";

import {
  BookOpenIcon,
  ChartBarIcon,
  FolderSimpleIcon,
  GearSixIcon,
  KeyIcon,
  LightningIcon,
  ListChecksIcon,
  PlugsConnectedIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { OrganizationRole } from "./types";
import { organizationHref } from "./queries";

const groups = [
  {
    label: "Activity",
    links: [
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
  return (
    <nav className="sidebar-navigation" aria-label="Main navigation">
      {projectId ? (
        groups.map((group) => (
          <div className="sidebar-group" key={group.label}>
            <p className="sidebar-group-label">{group.label}</p>
            <ul role="list">
              {group.links
                .filter((link) => !link.privileged || canManage)
                .map(({ path, label, Icon }) => (
                  <li key={path}>
                    <Link
                      href={href + "/" + path}
                      className="sidebar-link"
                      aria-label={label}
                      title={label}
                      aria-current={
                        pathname === href + "/" + path ||
                        pathname.startsWith(href + "/" + path + "/")
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
        <div className="sidebar-group">
          <p className="sidebar-group-label">Workspace</p>
          <ul role="list">
            <li>
              <Link
                href={
                  organizationId
                    ? organizationHref(organizationId)
                    : "/dashboard"
                }
                className="sidebar-link"
                aria-label="Projects"
                title="Projects"
                aria-current={pathname === "/dashboard" ? "page" : undefined}
                onNavigate={onNavigate}
              >
                <FolderSimpleIcon size={18} aria-hidden="true" />
                <span>Projects</span>
              </Link>
            </li>
            {organizationId && (
              <li>
                <Link
                  href={
                    "/dashboard/organizations/" +
                    encodeURIComponent(organizationId) +
                    "/settings"
                  }
                  className="sidebar-link"
                  aria-label="Organization and team"
                  title="Organization and team"
                  aria-current={
                    pathname.startsWith("/dashboard/organizations/")
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
          </ul>
        </div>
      )}
      {projectId && (
        <div className="sidebar-guide">
          <Link
            href={href + "/receiver-guide"}
            className="sidebar-link"
            aria-label="Receiver guide"
            title="Receiver guide"
            aria-current={
              pathname === href + "/receiver-guide" ? "page" : undefined
            }
            onNavigate={onNavigate}
          >
            <BookOpenIcon size={18} aria-hidden="true" />
            <span>Receiver guide</span>
          </Link>
        </div>
      )}
    </nav>
  );
}
