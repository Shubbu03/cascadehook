"use client";

import { PageSkeleton, UsageSkeleton } from "@/features/workspace/skeletons";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { QueryState, RefreshButton } from "@/components/query-state";
import { AccessRedirect } from "@/features/workspace/access-redirect";
import {
  organizationQuery,
  organizationHref,
} from "@/features/workspace/queries";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import type { Usage } from "./types";
import { OrganizationUsageSummary, UsageActivity } from "./usage-summary";
import { dashboardMain } from "@/components/styles";
import { queryKeys } from "@/lib/query-keys";

export function OrganizationUsage({
  organizationId,
}: {
  organizationId: string;
}) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const organization = useQuery(
    organizationQuery(userId, organizationId, getToken),
  );
  return (
    <main id="main-content" data-ui="dashboard-main" className={dashboardMain}>
      <Link
        href={organizationHref(organizationId)}
        className="inline-flex items-center text-[13px] font-medium text-muted gap-2 [&:hover]:underline [&:hover]:underline-offset-4 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]"
      >
        ← Projects
      </Link>
      <QueryState query={organization} loading={<PageSkeleton variant="usage" />}>
        {organization.data &&
          (organization.data.role === "member" ? (
            <AccessRedirect href={organizationHref(organizationId)} />
          ) : (
            <OrganizationUsageContent organizationId={organizationId} />
          ))}
      </QueryState>
    </main>
  );
}

function OrganizationUsageContent({
  organizationId,
}: {
  organizationId: string;
}) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const usage = useQuery({
    queryKey: queryKeys.organizationUsage(userId, organizationId),
    queryFn: ({ signal }) =>
      apiRequest<Usage>(
        "/v1/organizations/" + encodeURIComponent(organizationId) + "/usage",
        getToken,
        { signal },
      ),
  });
  return (
    <section>
      <PageHeader
        title="Organization usage"
        actions={
          <RefreshButton pending={usage.isFetching} refresh={usage.refetch} />
        }
      />
      <QueryState query={usage} loading={<UsageSkeleton />}>
        {usage.data && (
          <>
            <OrganizationUsageSummary usage={usage.data} />
            <UsageActivity usage={usage.data} />
          </>
        )}
      </QueryState>
    </section>
  );
}
