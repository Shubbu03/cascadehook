"use client";

import { useAuth } from "@clerk/nextjs";
import { BookOpenIcon, PlugsConnectedIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";
import { CopyButton } from "@/components/copy-button";
import { apiRequest } from "@/lib/api";
import { ConnectionError } from "@/features/workspace/connection-error";
import { ContentLoading } from "@/features/workspace/loading";
import { useSessionUserId } from "@/features/workspace/session";
import { projectQuery } from "@/features/workspace/queries";
import type { Project } from "@/features/workspace/types";

type ProjectStatus = { project_id: string; suspended: boolean };
type ProjectContextValue = {
  project: Project;
  canManage: boolean;
  suspended: boolean;
  availabilityKnown: boolean;
};
const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject() {
  const project = useContext(ProjectContext);
  if (!project) throw new Error("Project context is required.");
  return project;
}

export function projectHref(projectId: string) {
  return "/dashboard/projects/" + encodeURIComponent(projectId);
}

export function ProjectWorkspace({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const pathname = usePathname();
  const project = useQuery(projectQuery(userId, projectId, getToken));
  const status = useQuery({
    queryKey: ["project-status", userId, projectId],
    enabled: project.isSuccess,
    queryFn: ({ signal }) =>
      apiRequest<ProjectStatus>(
        "/v1/projects/" + encodeURIComponent(projectId) + "/status",
        getToken,
        { signal },
      ),
    staleTime: 0,
  });
  const href = projectHref(projectId);
  if (project.isPending)
    return (
      <main id="main-content" className="page-width workspace-main">
        <ContentLoading />
      </main>
    );
  if (project.isError)
    return (
      <main id="main-content" className="page-width workspace-main">
        <ConnectionError
          error={project.error}
          retry={() => {
            void project.refetch();
          }}
          pending={project.isFetching}
        />
      </main>
    );
  const canManage =
    project.data.role === "owner" || project.data.role === "admin";

  return (
    <ProjectContext
      value={{
        project: project.data,
        canManage,
        suspended: status.data?.suspended ?? false,
        availabilityKnown: status.isSuccess,
      }}
    >
      <main id="main-content" className="project-workspace page-width">
        <div className="project-heading">
          <div className="project-heading-title">
            <h1>{project.data.name}</h1>
            <span className="status status-neutral">{project.data.role}</span>
          </div>
          <div className="project-heading-meta">
            <code>{projectId}</code>
            <CopyButton
              value={projectId}
              label="Copy ID"
              successMessage="Project ID copied."
            />
          </div>
        </div>
        {status.data?.suspended && (
          <div className="notice notice-warning" role="status">
            This project is paused. You can review and edit existing endpoints,
            rotate signing secrets, and disable delivery. New endpoints,
            verification, and activation are unavailable.
          </div>
        )}
        {status.isError && (
          <div className="notice notice-warning" role="status">
            We couldn&apos;t check project availability. You can still review
            existing endpoints.{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                void status.refetch();
              }}
              disabled={status.isFetching}
            >
              Check again
            </button>
          </div>
        )}
        {!canManage && (
          <p className="notice">
            You have read-only access. An owner or admin can change endpoint
            settings.
          </p>
        )}
        <div className="project-layout">
          <nav className="project-navigation" aria-label="Project navigation">
            <Link
              href={href + "/endpoints"}
              aria-current={
                pathname.startsWith(href + "/endpoints") ? "page" : undefined
              }
            >
              <PlugsConnectedIcon size={19} aria-hidden="true" />
              Endpoints
            </Link>
            <Link
              href={href + "/receiver-guide"}
              aria-current={
                pathname === href + "/receiver-guide" ? "page" : undefined
              }
            >
              <BookOpenIcon size={19} aria-hidden="true" />
              Receiver guide
            </Link>
          </nav>
          <div className="project-content">{children}</div>
        </div>
      </main>
    </ProjectContext>
  );
}
