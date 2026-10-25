"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import {
  organizationHref,
  organizationQuery,
} from "@/features/workspace/queries";
import { useSessionUserId } from "@/features/workspace/session";
import { InvitationManagement } from "./invitations";
import { Members } from "./members";
import { RenameForm } from "./rename-form";

export function OrganizationSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const organization = useQuery(
    organizationQuery(userId, organizationId, getToken),
  );
  const path = "/v1/organizations/" + encodeURIComponent(organizationId);
  return (
    <main id="main-content" className="dashboard-main organization-settings">
      <Link
        className="text-link workspace-muted"
        href={organizationHref(organizationId)}
      >
        ← Projects
      </Link>
      <QueryState query={organization}>
        {organization.data && (
          <>
            <PageHeader title="Organization settings" />
            {organization.data.role === "owner" && (
              <RenameForm
                kind="Organization"
                name={organization.data.name}
                path={path}
                saved={() =>
                  Promise.all([
                    client.invalidateQueries({
                      queryKey: ["organization", userId, organizationId],
                    }),
                    client.invalidateQueries({
                      queryKey: ["organizations", userId],
                    }),
                  ])
                }
              />
            )}
            <Members organization={organization.data} />
            {organization.data.role === "owner" && (
              <InvitationManagement organization={organization.data} />
            )}
          </>
        )}
      </QueryState>
    </main>
  );
}
