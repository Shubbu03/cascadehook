"use client";

import { ConnectionError } from "./connection-error";
import { ContentLoading } from "./loading";
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
    <main id="main-content" className="dashboard-main">
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
        <ContentLoading />
      ) : organization.data ? (
        <Projects
          key={organization.data.id}
          organization={organization.data}
          userId={userId}
        />
      ) : (
        <div className="empty-state">
          <h1>No organizations</h1>
          <button
            type="button"
            className="button button-primary"
            onClick={createOrganization}
          >
            Create organization
          </button>
        </div>
      )}
    </main>
  );
}
