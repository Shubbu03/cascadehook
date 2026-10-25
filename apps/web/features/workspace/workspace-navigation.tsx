"use client";

import { useAuth } from "@clerk/nextjs";
import {
  BuildingsIcon,
  CheckIcon,
  FolderSimpleIcon,
  GearSixIcon,
  PlusIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { NavigationDropdown } from "@/components/navigation-dropdown";
import { organizationHref, projectsQuery } from "./queries";
import { useSessionUserId } from "./session";
import { useWorkspaceSelection } from "./use-workspace-selection";
import { useWorkspaceCreation } from "./workspace-creation";

type Selection = ReturnType<typeof useWorkspaceSelection>;

export function WorkspaceNavigation() {
  const selection = useWorkspaceSelection();
  return (
    <nav className="workspace-switchers" aria-label="Workspace">
      <OrganizationSwitcher selection={selection} />
      <span className="workspace-path-divider" aria-hidden="true">
        /
      </span>
      <ProjectSwitcher selection={selection} />
    </nav>
  );
}

function OrganizationSwitcher({ selection }: { selection: Selection }) {
  const { organization, organizations } = selection;
  const { createOrganization } = useWorkspaceCreation();
  const active = organization.data;
  const loaded = organizations.data?.pages.flatMap((page) => page.data) ?? [];
  const items =
    active && !loaded.some((item) => item.id === active.id)
      ? [active, ...loaded]
      : loaded;

  return (
    <NavigationDropdown
      label={"Change organization" + (active ? ": " + active.name : "")}
      trigger={
        <>
          <span className="workspace-avatar" aria-hidden="true">
            {active ? (
              [...active.name][0]?.toUpperCase()
            ) : (
              <BuildingsIcon size={17} />
            )}
          </span>
          <span className="switcher-name">
            {active?.name ??
              (organization.isError
                ? "Organization unavailable"
                : "Organizations")}
          </span>
        </>
      }
    >
      <div className="switcher-panel-heading">
        <span
          className="workspace-avatar workspace-avatar-large"
          aria-hidden="true"
        >
          {active ? (
            [...active.name][0]?.toUpperCase()
          ) : (
            <BuildingsIcon size={22} />
          )}
        </span>
        <div>
          <strong>{active?.name ?? "Organizations"}</strong>
          <span>{active?.role ?? "Your workspaces"}</span>
        </div>
      </div>
      <div className="switcher-options">
        {organizations.isPending && (
          <p className="switcher-message" role="status">
            Loading organizations…
          </p>
        )}
        {organizations.isError && (
          <SwitcherError
            error={organizations.error}
            retry={() => {
              void organizations.refetch();
            }}
            pending={organizations.isFetching}
          />
        )}
        <ul role="list">
          {items.map((item) => (
            <SwitcherItem
              key={item.id}
              href={organizationHref(item.id)}
              name={item.name}
              selected={item.id === active?.id}
              icon={
                <span className="workspace-avatar">
                  {[...item.name][0]?.toUpperCase()}
                </span>
              }
            />
          ))}
        </ul>
        {organizations.hasNextPage && (
          <button
            className="switcher-action"
            type="button"
            disabled={organizations.isFetchingNextPage}
            onClick={() => {
              void organizations.fetchNextPage();
            }}
          >
            {organizations.isFetchingNextPage
              ? "Loading…"
              : "Load more organizations"}
          </button>
        )}
      </div>
      <div className="switcher-panel-footer">
        {active && (
          <Link
            className="switcher-action"
            href={
              "/dashboard/organizations/" +
              encodeURIComponent(active.id) +
              "/settings"
            }
          >
            <GearSixIcon size={18} aria-hidden="true" />
            Organization settings
          </Link>
        )}
        <button
          className="switcher-action"
          type="button"
          data-close-dropdown
          onClick={createOrganization}
        >
          <PlusIcon size={18} aria-hidden="true" />
          Create organization
        </button>
      </div>
    </NavigationDropdown>
  );
}

function ProjectSwitcher({ selection }: { selection: Selection }) {
  const { organization, project, projectId } = selection;
  const { createProject } = useWorkspaceCreation();
  const { getToken } = useAuth();
  const userId = useSessionUserId();
  const active = organization.data;
  const projects = useInfiniteQuery(
    projectsQuery(userId, active?.id, getToken),
  );
  const loaded = projects.data?.pages.flatMap((page) => page.data) ?? [];
  const current = project.data;
  const items =
    current && !loaded.some((item) => item.id === current.id)
      ? [current, ...loaded]
      : loaded;
  const canCreate = active && !organization.isError && active.role !== "member";

  return (
    <NavigationDropdown
      label={"Change project" + (current ? ": " + current.name : "")}
      trigger={
        <>
          <FolderSimpleIcon
            size={18}
            className="switcher-project-icon"
            aria-hidden="true"
          />
          <span className="switcher-name">
            {current?.name ??
              (project.isError
                ? "Project unavailable"
                : projectId
                  ? "Loading project…"
                  : "All projects")}
          </span>
        </>
      }
    >
      <div className="switcher-panel-label">{active?.name ?? "Projects"}</div>
      <div className="switcher-options">
        {project.isError && (
          <SwitcherError
            error={project.error}
            retry={() => {
              void project.refetch();
            }}
            pending={project.isFetching}
          />
        )}
        {organization.isError && (
          <SwitcherError
            error={organization.error}
            retry={() => {
              void organization.refetch();
            }}
            pending={organization.isFetching}
          />
        )}
        {active && projects.isPending && (
          <p className="switcher-message" role="status">
            Loading projects…
          </p>
        )}
        {projects.isError && (
          <SwitcherError
            error={projects.error}
            retry={() => {
              void projects.refetch();
            }}
            pending={projects.isFetching}
          />
        )}
        {active && projects.isSuccess && items.length === 0 && (
          <p className="switcher-message">No projects yet.</p>
        )}
        <ul role="list">
          {items.map((item) => (
            <SwitcherItem
              key={item.id}
              href={"/dashboard/projects/" + encodeURIComponent(item.id)}
              name={item.name}
              selected={item.id === projectId}
              icon={
                <span className="workspace-avatar workspace-avatar-project">
                  <FolderSimpleIcon size={17} />
                </span>
              }
            />
          ))}
        </ul>
        {projects.hasNextPage && (
          <button
            className="switcher-action"
            type="button"
            disabled={projects.isFetchingNextPage}
            onClick={() => {
              void projects.fetchNextPage();
            }}
          >
            {projects.isFetchingNextPage ? "Loading…" : "Load more projects"}
          </button>
        )}
      </div>
      <div className="switcher-panel-footer">
        {canCreate && (
          <button
            className="switcher-action"
            type="button"
            data-close-dropdown
            onClick={() => createProject(active)}
          >
            <PlusIcon size={18} aria-hidden="true" />
            Create project
          </button>
        )}
        <Link
          href={active ? organizationHref(active.id) : "/dashboard"}
          className="switcher-action"
        >
          <SquaresFourIcon size={18} aria-hidden="true" />
          All projects
        </Link>
      </div>
    </NavigationDropdown>
  );
}

function SwitcherItem({
  href,
  name,
  selected,
  icon,
}: {
  href: string;
  name: string;
  selected: boolean;
  icon: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="switcher-option"
        aria-current={selected ? "true" : undefined}
      >
        <span aria-hidden="true">{icon}</span>
        <span className="switcher-option-name">{name}</span>
        {selected && (
          <CheckIcon size={17} className="switcher-check" aria-hidden="true" />
        )}
      </Link>
    </li>
  );
}

function SwitcherError({
  error,
  retry,
  pending,
}: {
  error: Error;
  retry: () => void;
  pending: boolean;
}) {
  return (
    <div className="switcher-error" role="alert">
      <p>{error.message}</p>
      <button
        type="button"
        className="text-link"
        onClick={retry}
        disabled={pending}
      >
        {pending ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}
