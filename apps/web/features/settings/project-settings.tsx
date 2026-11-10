"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { Input } from "@/components/input";
import { PageHeader } from "@/components/page-header";
import { projectHref, useProject } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import { organizationHref } from "@/features/workspace/queries";
import type { Page, Project } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { useFormatTime } from "@/lib/display-preferences";
import { notify } from "@/lib/notify";
import { ProjectNotificationPreferences } from "./notification-preferences";
import { AuditHistory } from "./audit-history";
import { DeliveryPolicySettings } from "./delivery-policy-settings";
import { ProjectDetailsForm } from "./project-details-form";
import { ProjectEnvironment } from "@/features/projects/project-environment";
import { RetentionSettings } from "./retention-settings";
import { RenameForm } from "./rename-form";
import { SettingsRow, SettingsSection, SettingsTabs } from "./settings-layout";

export function ProjectSettings() {
  const formatTime = useFormatTime();
  const { project, canManage } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState(false);
  const [typedName, setTypedName] = useState("");
  const path = "/v1/projects/" + encodeURIComponent(project.id);
  const href = projectHref(project.id);
  const organizationSettings = "/dashboard/organizations/" + encodeURIComponent(project.organization_id) + "/settings";
  const remove = useMutation({
    mutationFn: () => apiRequest<unknown>(path, getToken, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirmation(false);
      notify("Project deletion requested.", "success");
      const queryKey = ["projects", userId, project.organization_id];
      await client.cancelQueries({ queryKey });
      client.setQueriesData<InfiniteData<Page<Project>>>({ queryKey }, (data) => data ? {
        ...data,
        pages: data.pages.map((page) => ({ ...page, data: page.data.filter((item) => item.id !== project.id) })),
      } : data);
      void client.invalidateQueries({ queryKey, refetchType: "none" });
      void client.invalidateQueries({ queryKey: ["usage", userId, "organization", project.organization_id], refetchType: "all" });
      router.replace(organizationHref(project.organization_id));
      router.refresh();
    },
    onError: (error) => {
      setConfirmation(false);
      notify(error.message, "error");
    },
  });
  return (
    <section>
      <PageHeader title="Project settings" description={<span className="flex flex-wrap items-center gap-2">Manage <strong>{project.name}</strong><ProjectEnvironment environment={project.environment} /></span>} />
      <SettingsTabs sections={[
        { id: "general", label: "General", content: <>
          <SettingsSection title="Project details" description="The name your team sees in the dashboard and project switcher.">
            {canManage ? <RenameForm key={project.name} kind="Project" name={project.name} path={path}
              saved={() => Promise.all([
                client.invalidateQueries({ queryKey: ["project", userId, project.id] }),
                client.invalidateQueries({ queryKey: ["projects", userId, project.organization_id] }),
              ])} /> : <SettingsRow title="Project name" description="An owner or admin can rename this project."><span className="text-[13px]">{project.name}</span></SettingsRow>}
            <ProjectDetailsForm key={project.description + ":" + project.environment} project={project} canManage={canManage} />
            <SettingsRow title="Project ID" description="The identifier used in API requests and integrations.">
              <div className="flex flex-wrap items-center gap-2 text-[12px]"><code className="break-all">{project.id}</code><CopyButton value={project.id} label="Copy ID" /></div>
            </SettingsRow>
            <SettingsRow title="Created"><span className="text-[12px] text-muted">{formatTime(project.created_at)}</span></SettingsRow>
          </SettingsSection>
          <SettingsSection title="Organization" description="Project access and team membership are managed by the owning organization.">
            <SettingsRow title="Your role" description="Your organization role determines what you can manage in this project.">
              <span className="rounded-full border border-border px-3 py-1 text-[12px] capitalize">{project.role}</span>
            </SettingsRow>
            <SettingsRow title="Team & permissions" description="View members, manage roles, and invite teammates.">
              <Link href={organizationSettings + "?section=team"} className={buttonStyles({ variant: "secondary", size: "small" })}>Manage team →</Link>
            </SettingsRow>
          </SettingsSection>
        </> },
        { id: "notifications", label: "Notifications", content: <ProjectNotificationPreferences projectId={project.id} organizationId={project.organization_id} /> },
        { id: "delivery", label: "Delivery policy", content: <DeliveryPolicySettings projectId={project.id} canManage={canManage} /> },
        { id: "retention", label: "Data retention", content: <RetentionSettings /> },
        ...(canManage ? [{ id: "audit", label: "Audit history", content: <AuditHistory organizationId={project.organization_id} projectId={project.id} /> }] : []),
        { id: "integrations", label: "Integrations", content: <SettingsSection title="Delivery & integrations" description="Configure how your application publishes events and where Cascadehook delivers them.">
          <SettingsRow title="Endpoints" description="Manage receiver URLs, event subscriptions, verification, and signing secrets.">
            <Link href={href + "/endpoints"} className={buttonStyles({ variant: "secondary", size: "small" })}>Manage endpoints →</Link>
          </SettingsRow>
          {canManage && <>
            <SettingsRow title="API keys" description="Create scoped credentials, set expiry dates, and rotate or revoke existing keys.">
              <Link href={href + "/api-keys"} className={buttonStyles({ variant: "secondary", size: "small" })}>Manage API keys →</Link>
            </SettingsRow>
            <SettingsRow title="Usage & limits" description="Review this project’s event volume, delivery attempts, and current limits.">
              <Link href={href + "/usage"} className={buttonStyles({ variant: "secondary", size: "small" })}>View usage →</Link>
            </SettingsRow>
          </>}
        </SettingsSection> },
        ...(project.role === "owner" ? [{ id: "danger", label: "Danger zone", content: <SettingsSection title="Delete project" description="Permanently remove this project and all of its data." danger>
          <div className="py-5">
            <p id="project-delete-description" className="mb-5 max-w-170 text-[13px]/7 text-muted">This removes the project, its credentials, endpoints, and retained history. New activity is blocked as soon as deletion is accepted. This cannot be undone.</p>
            <label className="mb-4 grid max-w-115 gap-2 text-[13px]">
              <span>Type <strong className="font-medium">{project.name}</strong> to confirm</span>
              <Input className="min-h-10 w-full rounded-md px-3 py-2.5 text-[14px] max-[37.5rem]:text-[16px]"
                value={typedName} onChange={(event) => setTypedName(event.target.value)} autoComplete="off" spellCheck={false}
                disabled={remove.isPending} aria-describedby="project-delete-description" />
            </label>
            <Button type="button" variant="secondary" className="text-danger" disabled={typedName !== project.name || remove.isPending}
              onClick={() => { remove.reset(); setConfirmation(true); }}>Delete project</Button>
            {remove.isError && <p className="my-3 text-[13px] text-danger" role="alert">{remove.error.message}</p>}
          </div>
        </SettingsSection> }] : []),
      ]} />
      {confirmation && <ConfirmDialog title="Permanently delete this project?" confirmLabel="Delete" pendingLabel="Deleting…" destructive pending={remove.isPending}
        onConfirm={() => { if (typedName === project.name && !remove.isPending) remove.mutate(); }} onCancel={() => setConfirmation(false)}>
        <p>{project.name} and its data will be removed. This cannot be undone.</p>
      </ConfirmDialog>}
    </section>
  );
}
