"use client";

import { Button } from "@/components/button";

import { useAuth } from "@clerk/nextjs";
import {
  ArrowUpRightIcon,
  FolderSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ConnectionError } from "./connection-error";
import { ProjectCardsSkeleton } from "./skeletons";
import { projectsQuery } from "./queries";
import { useWorkspaceCreation } from "./workspace-creation";
import type { Organization } from "./types";
import { ProjectEnvironment } from "@/features/projects/project-environment";
import { PageHeader } from "@/components/page-header";
import { emptyState } from "@/components/styles";

export function Projects({
  organization,
  userId,
}: {
  organization: Organization;
  userId: string;
}) {
  const { getToken } = useAuth();
  const { createProject } = useWorkspaceCreation();
  const projects = useInfiniteQuery(
    projectsQuery(userId, organization.id, getToken),
  );
  const items = projects.data?.pages.flatMap((page) => page.data) ?? [];
  const canCreate = organization.role !== "member";

  return (
    <section aria-labelledby="projects-heading">
      <PageHeader
        title="Projects"
        titleId="projects-heading"
        actions={
          canCreate && (
            <Button
              type="button"
              data-ui="button" size="small" className="leading-[1.4]"
              onClick={() => createProject(organization)}
            >
              <PlusIcon size={16} aria-hidden="true" />
              Create project
            </Button>
          )
        }
      />
      {projects.isPending ? (
        <ProjectCardsSkeleton />
      ) : (
        <>
          {projects.isError && (
            <ConnectionError
              error={projects.error}
              retry={() => {
                void projects.refetch();
              }}
              pending={projects.isFetching}
            />
          )}
          {projects.isSuccess && items.length === 0 && (
            <div data-ui="empty-state" className={emptyState}>
              <FolderSimpleIcon
                size={28}
                className="text-accent"
                aria-hidden="true"
              />
              <h2>No projects yet</h2>
              <p>
                {canCreate
                  ? "Create a project to start sending webhooks."
                  : "An owner or admin can create a project."}
              </p>
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4 my-4">
            {items.map((project) => (
              <Link
                key={project.id}
                href={"/dashboard/projects/" + encodeURIComponent(project.id)}
                className="flex items-center min-w-0 rounded-[10px] bg-surface [transition:border-color_0.15s,background-color_0.15s] gap-3.5 p-5 border border-solid border-border [&_>_div]:min-w-0 [&_h2]:text-[16px] [&_h2]:font-medium [&_h2]:wrap-anywhere [&_>_svg]:shrink-0 [&_>_svg]:ml-auto [&_>_svg]:text-muted [&_div_>_span]:block [&_div_>_span]:mt-1.25 [&_div_>_span]:text-muted [&_div_>_span]:text-[12px] [&:hover]:bg-surface-hover [&:hover]:border-[color-mix(in_srgb,var(--accent)_50%,var(--border))]"
              >
                <span className="grid place-items-center shrink-0 rounded-[9px] text-accent bg-accent-subtle size-9" aria-hidden="true">
                  <FolderSimpleIcon size={22} />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2>{project.name}</h2><ProjectEnvironment environment={project.environment} /></div>
                  {project.description && <p className="mt-2 line-clamp-2 text-[12px]/6 text-muted">{project.description}</p>}
                  <span>{project.role}</span>
                </div>
                <ArrowUpRightIcon size={18} aria-hidden="true" />
              </Link>
            ))}
          </div>
          {projects.hasNextPage && (
            <Button
              type="button"
              data-ui="button" variant="quiet"
              disabled={projects.isFetchingNextPage}
              onClick={() => {
                void projects.fetchNextPage();
              }}
            >
              {projects.isFetchingNextPage ? "Loading…" : "Load more projects"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
