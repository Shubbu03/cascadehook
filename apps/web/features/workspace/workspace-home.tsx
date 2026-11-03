"use client";

import { Button } from "@/components/button";

import { ConnectionError } from "./connection-error";
import { PageSkeleton } from "./skeletons";
import { Projects } from "./projects";
import { useSessionUserId } from "./session";
import { useWorkspaceSelection } from "./use-workspace-selection";
import { useWorkspaceCreation } from "./workspace-creation";

export function WorkspaceHome() {
  const userId = useSessionUserId();
  const { organization, organizations } = useWorkspaceSelection();
  const { createOrganization } = useWorkspaceCreation();
  const error =
    organization.error ??
    (organization.data || organizations.data ? null : organizations.error);
  const loading =
    !organization.data && (organizations.isPending || organization.isFetching);

  return (
    <main id="main-content" data-ui="dashboard-main" className="w-full min-w-0 min-h-[calc(100svh-var(--topbar-height,60px))] pt-7 pb-16 m-0 px-8 max-[56.25rem]:pt-6 max-[56.25rem]:pb-12 max-[56.25rem]:px-6 max-[37.5rem]:pt-5.5 max-[37.5rem]:pb-10 max-[37.5rem]:px-4.5">
      {error ? (
        <ConnectionError
          error={error}
          retry={() => {
            void (organization.isError
              ? organization.refetch()
              : organizations.refetch());
          }}
          pending={organization.isFetching || organizations.isFetching}
        />
      ) : loading ? (
        <PageSkeleton variant="projects" />
      ) : organization.data ? (
        <Projects
          key={organization.data.id}
          organization={organization.data}
          userId={userId}
        />
      ) : (
        <div data-ui="empty-state" className="justify-items-start rounded-xl p-7 border border-border [&_h3]:tracking-[-0.02em] [&_p]:text-muted flex flex-col items-center justify-center min-h-55 bg-transparent text-center gap-3 py-8 px-6 border-dashed max-[37.5rem]:min-h-50 max-[37.5rem]:px-4.5 [&_h2]:text-[17px] [&_h2]:m-0 [&_h3]:text-[17px] [&_h3]:m-0 [&_p]:max-w-120 [&_p]:text-[13px] [&_p]:leading-[1.7] [&_p]:m-0">
          <h1>No organizations</h1>
          <Button
            type="button"
            data-ui="button"
            onClick={createOrganization}
          >
            Create organization
          </Button>
        </div>
      )}
    </main>
  );
}
