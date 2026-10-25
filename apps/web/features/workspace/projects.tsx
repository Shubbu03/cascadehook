"use client";

import { useAuth } from "@clerk/nextjs";
import {
  ArrowUpRightIcon,
  FolderSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ConnectionError } from "./connection-error";
import { ContentLoading } from "./loading";
import { projectsQuery } from "./queries";
import { useWorkspaceCreation } from "./workspace-creation";
import type { Organization } from "./types";
import { PageHeader } from "@/components/page-header";

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
            <button
              type="button"
              className="button button-small button-primary"
              onClick={() => createProject(organization)}
            >
              <PlusIcon size={16} aria-hidden="true" />
              Create project
            </button>
          )
        }
      />
      {projects.isPending ? (
        <ContentLoading />
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
            <div className="empty-state">
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
          <div className="workspace-project-grid">
            {items.map((project) => (
              <Link
                key={project.id}
                href={"/dashboard/projects/" + encodeURIComponent(project.id)}
                className="workspace-project-card"
              >
                <span className="workspace-project-icon" aria-hidden="true">
                  <FolderSimpleIcon size={22} />
                </span>
                <div>
                  <h2>{project.name}</h2>
                  <span>{project.role}</span>
                </div>
                <ArrowUpRightIcon size={18} aria-hidden="true" />
              </Link>
            ))}
          </div>
          {projects.hasNextPage && (
            <button
              type="button"
              className="button button-quiet"
              disabled={projects.isFetchingNextPage}
              onClick={() => {
                void projects.fetchNextPage();
              }}
            >
              {projects.isFetchingNextPage ? "Loading…" : "Load more projects"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
