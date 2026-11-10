"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonStyles } from "@/components/button";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { organizationHref, organizationQuery } from "@/features/workspace/queries";
import { useSessionUserId } from "@/features/workspace/session";
import { PageSkeleton } from "@/features/workspace/skeletons";
import { useFormatTime } from "@/lib/display-preferences";
import { OrganizationNotificationPreferences } from "./notification-preferences";
import { AuditHistory } from "./audit-history";
import { RetentionSettings } from "./retention-settings";
import { InvitationManagement } from "./invitations";
import { Members } from "./members";
import { RenameForm } from "./rename-form";
import { DeleteOrganization } from "./delete-organization";
import { LeaveOrganization } from "./leave-organization";
import { SettingsRow, SettingsSection, SettingsTabs } from "./settings-layout";

export function OrganizationSettings({ organizationId }: { organizationId: string }) {
  const formatTime = useFormatTime();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const returnTo = useSearchParams().get("returnTo") === "account" ? "/account?section=account" : "/dashboard";
  const organization = useQuery(organizationQuery(userId, organizationId, getToken));
  const path = "/v1/organizations/" + encodeURIComponent(organizationId);
  return (
    <main id="main-content" data-ui="dashboard-main organization-settings" className="m-0 min-h-[calc(100svh-var(--topbar-height,60px))] w-full min-w-0 px-8 pt-7 pb-16 max-[56.25rem]:px-6 max-[37.5rem]:px-4.5">
      <Link className="mb-5 inline-flex min-h-9 items-center text-[12px] font-medium text-muted hover:text-foreground"
        href={returnTo !== "/dashboard" ? returnTo : organizationHref(organizationId)}>
        {returnTo !== "/dashboard" ? "← Account settings" : "← Projects"}
      </Link>
      <QueryState query={organization} loading={<PageSkeleton variant="settings" />}>
        {organization.data && <>
          <PageHeader title="Organization settings" description={<>Manage <strong>{organization.data.name}</strong>, its members, and your notification preferences.</>} />
          <SettingsTabs sections={[
            { id: "general", label: "General", content: <SettingsSection title="Organization details" description="Your shared workspace for projects, team access, and usage.">
              {organization.data.role === "owner" ? <RenameForm key={organization.data.name} kind="Organization" name={organization.data.name} path={path}
                saved={() => Promise.all([
                  client.invalidateQueries({ queryKey: ["organization", userId, organizationId] }),
                  client.invalidateQueries({ queryKey: ["organizations", userId] }),
                ])} /> : <SettingsRow title="Organization name" description="An owner can rename this organization."><span className="text-[13px]">{organization.data.name}</span></SettingsRow>}
              <SettingsRow title="Organization ID" description="Use this identifier when contacting support.">
                <div className="flex flex-wrap items-center gap-2 text-[12px]"><code className="break-all">{organizationId}</code><CopyButton value={organizationId} label="Copy ID" /></div>
              </SettingsRow>
              <SettingsRow title="Your role"><span className="text-[12px] capitalize">{organization.data.role}</span></SettingsRow>
              <SettingsRow title="Created"><span className="text-[12px] text-muted">{formatTime(organization.data.created_at)}</span></SettingsRow>
              {organization.data.role !== "member" && <SettingsRow title="Usage & limits" description="Review shared event quotas and usage across the organization’s projects.">
                <Link className={buttonStyles({ variant: "secondary", size: "small" })} href={"/dashboard/organizations/" + encodeURIComponent(organizationId) + "/usage"}>View usage →</Link>
              </SettingsRow>}
            </SettingsSection> },
            { id: "team", label: "Team", content: <>
              <Members organization={organization.data} />
              {organization.data.role === "owner" && <InvitationManagement organization={organization.data} />}
            </> },
            { id: "notifications", label: "Notifications", content: <OrganizationNotificationPreferences organizationId={organizationId} /> },
            { id: "retention", label: "Data retention", content: <RetentionSettings /> },
            ...(organization.data.role !== "member" ? [{ id: "audit", label: "Audit history", content: <AuditHistory organizationId={organizationId} /> }] : []),
            { id: "danger", label: "Danger zone", content: <SettingsSection title="Membership & deletion" description="Leave this organization or permanently delete it if you’re an owner." danger>
              <div data-ui="organization-danger-zone">
                <DeleteOrganization key={organization.data.id + ":" + organization.data.name + ":" + organization.data.role}
                  organization={organization.data} returnTo={returnTo} />
                <LeaveOrganization organization={organization.data} />
              </div>
            </SettingsSection> },
          ]} />
        </>}
      </QueryState>
    </main>
  );
}
