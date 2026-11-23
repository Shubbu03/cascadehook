"use client";

import { UsageSkeleton } from "@/features/workspace/skeletons";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { QueryState, RefreshButton } from "@/components/query-state";
import { projectHref, useProject } from "@/features/projects/project-workspace";
import { organizationUsageQuery, projectUsageQuery } from "@/features/projects/section-queries";
import { AccessRedirect } from "@/features/workspace/access-redirect";
import { useSessionUserId } from "@/features/workspace/session";
import {
  OrganizationUsageSummary,
  Quota,
  UsageActivity,
} from "./usage-summary";

export function ProjectUsage() {
  const { project, canManage } = useProject();
  return canManage ? (
    <UsageContent />
  ) : (
    <AccessRedirect href={projectHref(project.id)} />
  );
}

function UsageContent() {
  const { project } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const projectUsage = useQuery(projectUsageQuery(userId, project.id, getToken));
  const organization = useQuery(
    organizationUsageQuery(userId, project.organization_id, getToken),
  );
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
            <h2 className="mt-9 text-[19px] in-data-[ui~='dashboard-main']:mt-7 in-data-[ui~='dashboard-main']:text-[17px]">This project</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-4 my-6 in-data-[ui~='dashboard-main']:grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] in-data-[ui~='dashboard-main']:gap-3.5 in-data-[ui~='dashboard-main']:my-5">
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
