"use client";

import { UsageSkeleton } from "@/features/workspace/skeletons";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { QueryState, RefreshButton } from "@/components/query-state";
import { projectPath } from "@/features/activity/types";
import { useProject } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import {
  OrganizationUsageSummary,
  Quota,
  UsageActivity,
} from "./usage-summary";
import type { Usage } from "./types";

export function ProjectUsage() {
  const { canManage } = useProject();
  return canManage ? (
    <UsageContent />
  ) : (
    <p className="notice">
      Usage is available to organization owners and admins.
    </p>
  );
}

function UsageContent() {
  const { project } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const projectUsage = useQuery({
    queryKey: ["usage", userId, "project", project.id],
    queryFn: ({ signal }) =>
      apiRequest<Usage>(projectPath(project.id, "usage"), getToken, { signal }),
  });
  const organization = useQuery({
    queryKey: ["usage", userId, "organization", project.organization_id],
    queryFn: ({ signal }) =>
      apiRequest<Usage>(
        "/v1/organizations/" +
          encodeURIComponent(project.organization_id) +
          "/usage",
        getToken,
        { signal },
      ),
  });
  return (
    <section>
      <PageHeader
        title="Usage"
        actions={
          <RefreshButton
            pending={projectUsage.isFetching || organization.isFetching}
            refresh={() =>
              Promise.all([projectUsage.refetch(), organization.refetch()])
            }
          />
        }
      />
      <QueryState query={organization} loading={<UsageSkeleton />}>
        {organization.data && (
          <OrganizationUsageSummary usage={organization.data} />
        )}
      </QueryState>
      <QueryState query={projectUsage} loading={<UsageSkeleton />}>
        {projectUsage.data && (
          <>
            <h2 className="settings-section-title">This project</h2>
            <div className="usage-grid">
              <Quota
                label="Endpoints"
                value={projectUsage.data.endpoints}
                limit={projectUsage.data.limits.endpoints_per_project}
              />
              <Quota
                label="Active API keys"
                value={projectUsage.data.active_api_keys}
                limit={projectUsage.data.limits.active_api_keys_per_project}
              />
              <Quota
                label="Stored payloads"
                value={projectUsage.data.stored_payload_bytes}
                limit={projectUsage.data.limits.payload_bytes_per_project}
                bytes
              />
            </div>
            <UsageActivity usage={projectUsage.data} />
          </>
        )}
      </QueryState>
    </section>
  );
}
