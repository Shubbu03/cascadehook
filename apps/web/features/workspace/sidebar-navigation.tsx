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
  RocketLaunchIcon,
  SquaresFourIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { docsHref } from "@/lib/docs";
import type { OrganizationRole } from "./types";
import { organizationHref } from "./queries";

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
                      href={path ? href + "/" + path : href}
                      className="sidebar-link"
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
                  className="sidebar-link"
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
      <div className="sidebar-guide">
        <a
          href={docsHref("/docs/quickstart")}
          className="sidebar-link"
          aria-label="Quickstart"
          title="Quickstart"
          onClick={onNavigate}
        >
          <RocketLaunchIcon size={18} aria-hidden="true" />
          <span>Quickstart</span>
        </a>
        {projectId && (
          <a
            href={docsHref("/docs/receivers")}
            className="sidebar-link"
            aria-label="Receiver guide"
            title="Receiver guide"
            onClick={onNavigate}
          >
            <BookOpenIcon size={18} aria-hidden="true" />
            <span>Receiver guide</span>
          </a>
        )}
      </div>
    </nav>
  );
}
