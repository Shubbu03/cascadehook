"use client";

import { useAuth } from "@clerk/nextjs";
import {
  ChartBarIcon,
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
import { Skeleton } from "@/components/skeleton";
import { NavigationSkeleton } from "./skeletons";
import { organizationHref, projectsQuery } from "./queries";
import { useSessionUserId } from "./session";
import { useWorkspaceSelection } from "./use-workspace-selection";
import { useWorkspaceCreation } from "./workspace-creation";

type Selection = ReturnType<typeof useWorkspaceSelection>;

export function WorkspaceNavigation() {
  const selection = useWorkspaceSelection();
  return (
    <nav className={"flex items-center min-w-0 gap-2 before:text-border before:text-[24px] before:font-light before:mr-2 before:[content:\"/\"] in-data-[ui~='dashboard-topbar']:flex-[0_1_auto] in-data-[ui~='dashboard-topbar']:min-w-0 in-data-[ui~='dashboard-topbar']:gap-1.5 [[data-ui~='dashboard-topbar']_&::before]:hidden [[data-ui~='dashboard-topbar']_&::before]:content-none max-[37.5rem]:gap-1 max-[56.25rem]:in-data-[ui~='dashboard-topbar']:flex-1"} aria-label="Workspace">
      <OrganizationSwitcher selection={selection} />
      <span className="text-border text-[24px] font-light max-[37.5rem]:in-data-[ui~='dashboard-topbar']:text-[18px]" aria-hidden="true">
        /
      </span>
      <ProjectSwitcher selection={selection} />
    </nav>
  );
}

function OrganizationSwitcher({ selection }: { selection: Selection; }) {
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
          <span className="grid place-items-center shrink-0 rounded-[7px] bg-accent-subtle text-accent text-[12px] font-medium size-7 in-data-[ui~='dashboard-topbar']:rounded-[5px] in-data-[ui~='dashboard-topbar']:text-[11px] in-data-[ui~='dashboard-topbar']:size-6" aria-hidden="true">
            {active ? (
              [...active.name][0]?.toUpperCase()
            ) : (
              <BuildingsIcon size={17} />
            )}
          </span>
          <span className="min-w-0 max-w-47.5 truncate in-data-[ui~='dashboard-topbar']:max-w-55 max-[56.25rem]:in-data-[ui~='dashboard-topbar']:max-w-40 max-[37.5rem]:in-data-[ui~='dashboard-topbar']:max-w-25">
            {active?.name ??
              (organization.isError
                ? "Organization unavailable"
                : "Organizations")}
          </span>
        </>
      }
    >
      <div className="flex items-center pt-3 pb-4.5 mb-1.5 border-b [border-bottom-style:solid] border-b-border gap-3 px-2.5 [&_>_div]:min-w-0 [&_strong]:block [&_strong]:text-[15px] [&_strong]:font-medium [&_strong]:wrap-anywhere [&_div_>_span]:block [&_div_>_span]:mt-1 [&_div_>_span]:text-muted [&_div_>_span]:text-[12px]">
        <span
          className="grid place-items-center shrink-0 rounded-[9px] bg-accent-subtle text-accent text-[18px] font-medium size-10.5 in-data-[ui~='dashboard-topbar']:rounded-[5px] in-data-[ui~='dashboard-topbar']:text-[11px] in-data-[ui~='dashboard-topbar']:size-6"
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
      <div className="max-h-[min(360px,50svh)] overflow-y-auto overscroll-contain [&_ul]:list-none [&_ul]:m-0 [&_ul]:p-0">
        {organizations.isPending && (
          <NavigationSkeleton label="Loading organizations…" />
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
                <span className="grid place-items-center shrink-0 rounded-[7px] bg-accent-subtle text-accent text-[12px] font-medium size-7 in-data-[ui~='dashboard-topbar']:rounded-[5px] in-data-[ui~='dashboard-topbar']:text-[11px] in-data-[ui~='dashboard-topbar']:size-6">
                  {[...item.name][0]?.toUpperCase()}
                </span>
              }
            />
          ))}
        </ul>
        {organizations.hasNextPage && (
          <button
            className="flex items-center w-full min-h-11 rounded-md text-[14px] text-left bg-transparent text-muted gap-3 py-2.25 px-2.5 border-0 border-none border-current [&_>_svg]:shrink-0 [&_>_svg]:mx-1.25 [&:hover]:bg-surface-hover [&:hover]:text-foreground focus-visible:-outline-offset-2"
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
      <div className="pt-1.5 mt-1.5 border-t [border-top-style:solid] border-t-border">
        {active && (
          <Link
            className="flex items-center w-full min-h-11 rounded-md text-[14px] text-left bg-transparent text-muted gap-3 py-2.25 px-2.5 border-0 border-none border-current [&_>_svg]:shrink-0 [&_>_svg]:mx-1.25 [&:hover]:bg-surface-hover [&:hover]:text-foreground focus-visible:-outline-offset-2"
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
        {active && active.role !== "member" && (
          <Link
            className="flex items-center w-full min-h-11 rounded-md text-[14px] text-left bg-transparent text-muted gap-3 py-2.25 px-2.5 border-0 border-none border-current [&_>_svg]:shrink-0 [&_>_svg]:mx-1.25 [&:hover]:bg-surface-hover [&:hover]:text-foreground focus-visible:-outline-offset-2"
            href={
              "/dashboard/organizations/" +
              encodeURIComponent(active.id) +
              "/usage"
            }
          >
            <ChartBarIcon size={18} aria-hidden="true" />
            Organization usage
          </Link>
        )}
        <button
          className="flex items-center w-full min-h-11 rounded-md text-[14px] text-left bg-transparent text-muted gap-3 py-2.25 px-2.5 border-0 border-none border-current [&_>_svg]:shrink-0 [&_>_svg]:mx-1.25 [&:hover]:bg-surface-hover [&:hover]:text-foreground focus-visible:-outline-offset-2"
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

function ProjectSwitcher({ selection }: { selection: Selection; }) {
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
            className="shrink-0 text-muted max-[37.5rem]:in-data-[ui~='dashboard-topbar']:hidden"
            aria-hidden="true"
          />
          <span className="min-w-0 max-w-47.5 truncate in-data-[ui~='dashboard-topbar']:max-w-55 max-[56.25rem]:in-data-[ui~='dashboard-topbar']:max-w-40 max-[37.5rem]:in-data-[ui~='dashboard-topbar']:max-w-25">
            {current?.name ??
              (project.isError
                ? "Project unavailable"
                : projectId
                  ? <Skeleton width={110} height={12} />
                  : "All projects")}
          </span>
        </>
      }
    >
      <div className="text-muted text-[12px] wrap-anywhere py-3 px-2.5">{active?.name ?? "Projects"}</div>
      <div className="max-h-[min(360px,50svh)] overflow-y-auto overscroll-contain [&_ul]:list-none [&_ul]:m-0 [&_ul]:p-0">
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
          <NavigationSkeleton label="Loading projects…" />
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
          <p className="text-muted text-[13px] leading-[1.7] py-3 px-2.5">No projects yet.</p>
        )}
        <ul role="list">
          {items.map((item) => (
            <SwitcherItem
              key={item.id}
              href={"/dashboard/projects/" + encodeURIComponent(item.id)}
              name={item.environment ? `${item.name} · ${item.environment}` : item.name}
              selected={item.id === projectId}
              icon={
                <span className="grid place-items-center shrink-0 rounded-[7px] bg-surface-hover text-muted text-[12px] font-medium size-7 in-data-[ui~='dashboard-topbar']:rounded-[5px] in-data-[ui~='dashboard-topbar']:text-[11px] in-data-[ui~='dashboard-topbar']:size-6">
                  <FolderSimpleIcon size={17} />
                </span>
              }
            />
          ))}
        </ul>
        {projects.hasNextPage && (
          <button
            className="flex items-center w-full min-h-11 rounded-md text-[14px] text-left bg-transparent text-muted gap-3 py-2.25 px-2.5 border-0 border-none border-current [&_>_svg]:shrink-0 [&_>_svg]:mx-1.25 [&:hover]:bg-surface-hover [&:hover]:text-foreground focus-visible:-outline-offset-2"
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
      <div className="pt-1.5 mt-1.5 border-t [border-top-style:solid] border-t-border">
        {canCreate && (
          <button
            className="flex items-center w-full min-h-11 rounded-md text-[14px] text-left bg-transparent text-muted gap-3 py-2.25 px-2.5 border-0 border-none border-current [&_>_svg]:shrink-0 [&_>_svg]:mx-1.25 [&:hover]:bg-surface-hover [&:hover]:text-foreground focus-visible:-outline-offset-2"
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
          className="flex items-center w-full min-h-11 rounded-md text-[14px] text-left bg-transparent text-muted gap-3 py-2.25 px-2.5 border-0 border-none border-current [&_>_svg]:shrink-0 [&_>_svg]:mx-1.25 [&:hover]:bg-surface-hover [&:hover]:text-foreground focus-visible:-outline-offset-2"
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
        className="flex items-center w-full min-h-11 rounded-md text-[14px] text-left gap-3 py-2.25 px-2.5 [&:hover]:bg-surface-hover [&:hover]:text-foreground aria-[current]:bg-accent-subtle focus-visible:-outline-offset-2 *:aria-hidden:shrink-0"
        aria-current={selected ? "true" : undefined}
      >
        <span aria-hidden="true">{icon}</span>
        <span className="min-w-0 wrap-anywhere">{name}</span>
        {selected && (
          <CheckIcon size={17} className="shrink-0 ml-auto text-accent" aria-hidden="true" />
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
    <div data-ui="switcher-error" className="text-muted text-[13px] leading-[1.7] py-3 px-2.5" role="alert">
      <p>{error.message}</p>
      <button
        type="button"
        className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 mt-1.25 text-[13px] text-accent [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]"
        onClick={retry}
        disabled={pending}
      >
        {pending ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}
