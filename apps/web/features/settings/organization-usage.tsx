"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { QueryState, RefreshButton } from "@/components/query-state";
import {
  organizationQuery,
  organizationHref,
} from "@/features/workspace/queries";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import type { Usage } from "./types";
import { OrganizationUsageSummary, UsageActivity } from "./usage-summary";

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
    <main id="main-content" className="dashboard-main">
      <Link
        href={organizationHref(organizationId)}
        className="text-link workspace-muted"
      >
        ← Projects
      </Link>
      <QueryState query={organization}>
        {organization.data &&
          (organization.data.role === "member" ? (
            <p className="notice">
              Usage is available to organization owners and admins.
            </p>
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
    queryKey: ["usage", userId, "organization", organizationId],
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
      <QueryState query={usage}>
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
