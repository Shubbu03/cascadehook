"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
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
  if (project.isPending)
    return (
      <main id="main-content" className="dashboard-main">
        <ContentLoading />
      </main>
    );
  if (project.isError)
    return (
      <main id="main-content" className="dashboard-main">
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
      <main id="main-content" className="dashboard-main">
        {status.data?.suspended && (
          <p
            className="workspace-banner workspace-banner-warning"
            role="status"
          >
            Project paused. Publishing, replay, endpoint activation, and API key
            issuance are unavailable.
          </p>
        )}
        {status.isError && (
          <p
            className="workspace-banner workspace-banner-warning"
            role="status"
          >
            Project availability could not be checked.
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
          </p>
        )}
        {!canManage && <p className="workspace-banner">Read-only access</p>}
        <div className="project-content">{children}</div>
      </main>
    </ProjectContext>
  );
}
