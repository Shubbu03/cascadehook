"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { apiRequest } from "@/lib/api";
import { ConnectionError } from "@/features/workspace/connection-error";
import { RouteContentLoading } from "@/features/workspace/route-loading";
import { useSessionUserId } from "@/features/workspace/session";
import { projectQuery } from "@/features/workspace/queries";
import type { Project } from "@/features/workspace/types";
import { dashboardMain, warningBanner } from "@/components/styles";
import { queryKeys } from "@/lib/query-keys";

type ProjectStatus = { project_id: string; suspended: boolean; };
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
    queryKey: queryKeys.projectStatus(userId, projectId),
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
      <main id="main-content" data-ui="dashboard-main" className={dashboardMain}>
        <RouteContentLoading />
      </main>
    );
  if (project.isError)
    return (
      <main id="main-content" data-ui="dashboard-main" className={dashboardMain}>
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
      <main id="main-content" data-ui="dashboard-main" className={dashboardMain}>
        {status.data?.suspended && (
          <p
            className={warningBanner}
            role="status"
          >
            Project paused. Publishing, replay, endpoint activation, and API key
            issuance are unavailable.
          </p>
        )}
        {status.isError && (
          <p
            className={warningBanner}
            role="status"
          >
            Project availability could not be checked.
            <button
              type="button"
              className="inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 [font-size:inherit] underline [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]"
              onClick={() => {
                void status.refetch();
              }}
              disabled={status.isFetching}
            >
              Check again
            </button>
          </p>
        )}
        {!canManage && <p className="flex items-center flex-wrap mt-0 mb-5 rounded-md text-muted bg-surface text-[12px] leading-[1.6] gap-2.5 py-2.5 px-3 mx-0 border border-solid border-border">Read-only access</p>}
        <div data-ui="project-content" className="min-w-0 [&_section[id]]:scroll-mt-20">{children}</div>
      </main>
    </ProjectContext>
  );
}
