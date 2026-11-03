"use client";

import { buttonStyles } from "@/components/button";

import { PageSkeleton } from "@/features/workspace/skeletons";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { DeleteOrganization } from "./delete-organization";
import { LeaveOrganization } from "./leave-organization";

export function OrganizationSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const returnTo =
    useSearchParams().get("returnTo") === "account" ? "/account" : "/dashboard";
  const organization = useQuery(
    organizationQuery(userId, organizationId, getToken),
  );
  const path = "/v1/organizations/" + encodeURIComponent(organizationId);
  return (
    <main id="main-content" data-ui="dashboard-main organization-settings" className="w-full min-w-0 min-h-[calc(100svh-var(--topbar-height,60px))] pt-7 pb-16 m-0 px-8 max-[56.25rem]:pt-6 max-[56.25rem]:pb-12 max-[56.25rem]:px-6 max-[37.5rem]:pt-5.5 max-[37.5rem]:pb-10 max-[37.5rem]:px-4.5">
      <Link
        className="inline-flex items-center text-[13px] font-medium text-muted gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent [[data-ui~='settings-section']_>_&]:text-[14px] in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='organization-settings']_>_&:first-child]:mb-4.5 [[data-ui~='organization-settings']_>_&:first-child]:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]"
        href={
          returnTo === "/account"
            ? "/account"
            : organizationHref(organizationId)
        }
      >
        {returnTo === "/account" ? "← Account settings" : "← Projects"}
      </Link>
      <QueryState query={organization} loading={<PageSkeleton variant="settings" />}>
        {organization.data && (
          <>
            <PageHeader
              title="Organization settings"
              actions={
                organization.data.role !== "member" && (
                  <Link
                    data-ui="button" className={buttonStyles({ variant: "secondary", size: "small", className: "leading-[1.4]" })}
                    href={
                      "/dashboard/organizations/" +
                      encodeURIComponent(organizationId) +
                      "/usage"
                    }
                  >
                    View usage
                  </Link>
                )
              }
            />
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
            <section
              data-ui="settings-section danger-zone organization-danger-zone" className="border-t [border-top-style:solid] border-t-border [&_>_h3]:mb-4 [&_>_h2]:mb-4 [&_>_h2]:text-[19px] [&_>_p]:max-w-145 [&_>_p]:mb-5 [&_>_p]:text-muted [&_>_p]:text-[13px] [&_>_p]:leading-[1.8] mt-7.5 pt-6 max-w-none [&_>_h3]:text-[17px]"
              aria-labelledby="organization-danger-heading"
            >
              <h2 id="organization-danger-heading">Danger Zone</h2>
              <div className="rounded-[9px] bg-surface border border-solid border-danger-subtle">
                <DeleteOrganization
                  key={
                    organization.data.id +
                    ":" +
                    organization.data.name +
                    ":" +
                    organization.data.role
                  }
                  organization={organization.data}
                  returnTo={returnTo}
                />
                <LeaveOrganization organization={organization.data} />
              </div>
            </section>
          </>
        )}
      </QueryState>
    </main>
  );
}
