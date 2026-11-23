"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { QueryState } from "@/components/query-state";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { notificationInboxHref, type NotificationCategory } from "@/features/notifications/types";
import { useWorkspaceSelection } from "@/features/workspace/use-workspace-selection";
import { TestEmail } from "./test-email";
import { SettingsRow, SettingsSection, SettingsSwitch } from "./settings-layout";

type Preferences = {
  email_enabled: boolean;
  email_categories: NotificationCategory[];
  email_severities: string[];
};
type PreferencesResponse = Preferences & { email_available: boolean };
type ProjectPreferences = { email_enabled: boolean };

const preferencePath = "/v1/me/notification-preferences";
const categories: { id: NotificationCategory; title: string; description: string }[] = [
  { id: "delivery", title: "Delivery health", description: "Sustained retries, failed delivery incidents, and receiver recovery updates." },
  { id: "credentials", title: "API keys & credentials", description: "Key expiry reminders, rotations, and credential changes." },
  { id: "usage", title: "Usage & limits", description: "Usage thresholds and quota warnings that may affect delivery." },
  { id: "team", title: "Team activity", description: "Membership changes and invitation updates." },
  { id: "access", title: "Access changes", description: "Changes to your organization role and permissions." },
  { id: "project", title: "Project activity", description: "Project pauses and resumptions. Creation and name changes stay in-app." },
];

function useNotificationPreferences() {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["notification-preferences", userId],
    queryFn: ({ signal }) => apiRequest<PreferencesResponse>(preferencePath, getToken, { signal }),
  });
}

function PreferenceStatus({ pending, error, saved }: { pending: boolean; error: Error | null; saved: boolean }) {
  return (
    <div className="min-h-7 text-[12px]/7">
      {error ? <p role="alert" className="text-danger">Couldn’t save preferences. {error.message} Try again.</p>
        : <p role="status" className="text-muted">{pending ? "Saving preferences…" : saved ? "Preferences saved." : "Changes save automatically."}</p>}
    </div>
  );
}

function PreferencesLoading() {
  return <p role="status" className="py-8 text-[13px] text-muted">Loading notification preferences…</p>;
}

export function AccountNotificationPreferences() {
  const preferences = useNotificationPreferences();
  const { organization } = useWorkspaceSelection();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const { user } = useUser();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (data: Preferences) => apiRequest<Preferences>(preferencePath, getToken, { method: "PATCH", data }),
    onSuccess: (data) => {
      client.setQueryData<PreferencesResponse>(["notification-preferences", userId], (previous) =>
        previous ? { ...previous, ...data } : previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["notification-preferences", userId] }),
  });
  const current = preferences.data;
  const email = user?.primaryEmailAddress;
  const verified = email?.verification.status === "verified";
  return (
    <QueryState query={preferences} loading={<PreferencesLoading />}>
      {current && <>
        <SettingsSection title="Email notifications" description="Choose which updates reach your inbox. These preferences apply to you across all your organizations.">
          <SettingsSwitch title="Receive email notifications"
            description={verified ? `Send alerts to ${email.emailAddress}.` : "Add and verify a primary email in your profile to receive alerts."}
            checked={current.email_enabled} disabled={save.isPending || ((!current.email_available || !verified) && !current.email_enabled)}
            onChange={(checked) => save.mutate({ email_enabled: checked, email_categories: current.email_categories, email_severities: current.email_severities })} />
          <SettingsRow title="In-app notifications" description="Your notification inbox stays available, even when email is off.">
            <span className="rounded-full bg-success-subtle px-2.5 py-1 text-[11px] font-medium text-success">Always on</span>
          </SettingsRow>
          <TestEmail organizationId={organization.data?.id} available={current.email_available} />
        </SettingsSection>
        {!current.email_available && <p role="status" className="mb-6 text-[13px]/7 text-muted">Email delivery isn’t configured for this installation. Your in-app notifications are still available.</p>}
        <SettingsSection title="What to email you" description="Choose your alert categories. You’ll only receive updates your organization role allows you to see.">
          {categories.map((category) => <SettingsSwitch key={category.id} title={category.title} description={category.description}
            checked={current.email_categories.includes(category.id)} disabled={save.isPending || !current.email_enabled || !current.email_available || !verified}
            onChange={(checked) => save.mutate({ email_enabled: current.email_enabled,
              email_categories: checked ? [...current.email_categories, category.id] : current.email_categories.filter((item) => item !== category.id), email_severities: current.email_severities })} />)}
        </SettingsSection>
        <SettingsSection title="Alert severity" description="Choose the severity levels to include in email alerts. Category and organization preferences still apply.">
          {[
            { value: "info", title: "Information", description: "Routine configuration and account updates." },
            { value: "success", title: "Success", description: "Recovery and successful operational updates." },
            { value: "warning", title: "Warnings", description: "Issues that may need attention soon." },
            { value: "error", title: "Errors", description: "Failures that need your attention." },
          ].map((severity) => <SettingsSwitch key={severity.value} title={severity.title} description={severity.description}
            checked={current.email_severities.includes(severity.value)} disabled={save.isPending || !current.email_enabled || !current.email_available || !verified}
            onChange={(checked) => save.mutate({ email_enabled: current.email_enabled, email_categories: current.email_categories,
              email_severities: checked ? [...current.email_severities, severity.value] : current.email_severities.filter((item) => item !== severity.value) })} />)}
        </SettingsSection>
        <PreferenceStatus pending={save.isPending} error={save.error} saved={save.isSuccess} />
        <p className="mt-2 text-[12px]/7 text-muted">Email starts with new updates after you opt in. Invitations and sign-in emails are separate from these preferences. You can mute individual projects in their notification settings.</p>
      </>}
    </QueryState>
  );
}

export function ProjectNotificationPreferences({ projectId, organizationId }: { projectId: string; organizationId: string }) {
  const account = useNotificationPreferences();
  const organizationPreferences = useOrganizationPreferences(organizationId);
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const path = "/v1/projects/" + encodeURIComponent(projectId) + "/notification-preferences";
  const queryKey = ["project-notification-preferences", userId, projectId];
  const preferences = useQuery({
    queryKey,
    queryFn: ({ signal }) => apiRequest<ProjectPreferences>(path, getToken, { signal }),
  });
  const save = useMutation({
    mutationFn: (data: ProjectPreferences) => apiRequest<ProjectPreferences>(path, getToken, { method: "PATCH", data }),
    onSuccess: (data) => client.setQueryData(queryKey, data),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
  return (
    <QueryState query={preferences} loading={<PreferencesLoading />}>
      {preferences.data && <>
        <SettingsSection title="Project notifications" description="These preferences apply only to you. Your teammates keep their own notification settings.">
          <SettingsSwitch title="Email alerts for this project" description="Include this project in your email notifications, using the categories selected in your account."
            checked={preferences.data.email_enabled} disabled={save.isPending}
            onChange={(checked) => save.mutate({ email_enabled: checked })} />
          <SettingsRow title="In-app notifications" description="Project updates will continue to appear in your organization’s notification inbox.">
            <span className="text-[12px] text-muted">Always on</span>
          </SettingsRow>
        </SettingsSection>
        <QueryState query={account} loading={<PreferencesLoading />}>
          {account.data && <div className="mb-4 rounded-lg border border-border px-4 py-3 text-[13px]/7 text-muted">
            {!account.data.email_available ? "Email delivery isn’t configured for this installation. "
              : !account.data.email_enabled ? "Email notifications are off in your account. Turn them on to receive project alerts. "
              : organizationPreferences.data?.email_enabled === false ? "Email alerts are muted for this organization. "
              : !preferences.data.email_enabled ? "Email alerts are muted for this project. "
              : account.data.email_severities.length === 0 ? "No email severity levels are selected in your account. "
              : account.data.email_categories.length === 0 ? "No email categories are selected in your account. "
              : "This project uses your account’s email categories. "}
            <Link href="/account?section=notifications" className="font-medium text-accent hover:underline">Manage account preferences →</Link>
          </div>}
        </QueryState>
        <PreferenceStatus pending={save.isPending} error={save.error} saved={save.isSuccess} />
      </>}
    </QueryState>
  );
}

function useOrganizationPreferences(organizationId: string) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const path = "/v1/organizations/" + encodeURIComponent(organizationId) + "/notification-preferences";
  return useQuery({ queryKey: ["organization-notification-preferences", userId, organizationId],
    queryFn: ({ signal }) => apiRequest<ProjectPreferences>(path, getToken, { signal }) });
}

export function OrganizationNotificationPreferences({ organizationId }: { organizationId: string }) {
  const account = useNotificationPreferences();
  const preferences = useOrganizationPreferences(organizationId);
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const queryKey = ["organization-notification-preferences", userId, organizationId];
  const path = "/v1/organizations/" + encodeURIComponent(organizationId) + "/notification-preferences";
  const save = useMutation({ mutationFn: (data: ProjectPreferences) => apiRequest<ProjectPreferences>(path, getToken, { method: "PATCH", data }),
    onSuccess: (data) => client.setQueryData(queryKey, data), onSettled: () => client.invalidateQueries({ queryKey }) });
  return <QueryState query={preferences} loading={<PreferencesLoading />}>{preferences.data && <>
    <SettingsSection title="Organization notifications" description="Your personal preference for this organization and all its projects. Teammates keep their own settings.">
      <SettingsRow title="Inbox & archive" description="Review unread updates, find notifications you’ve read, or move an archived update back to your inbox.">
        <Link href={notificationInboxHref(organizationId)} className="text-[13px] font-medium text-accent hover:underline">Manage notifications →</Link>
      </SettingsRow>
      <SettingsSwitch title="Email alerts for this organization" description="Include this organization using your account’s selected categories and severity levels. Individual projects can still be muted."
        checked={preferences.data.email_enabled} disabled={save.isPending} onChange={(checked) => save.mutate({ email_enabled: checked })} />
      <SettingsRow title="In-app notifications" description="Muting email keeps your notification inbox available."><span className="text-[12px] text-muted">Always on</span></SettingsRow>
      <TestEmail organizationId={organizationId} available={account.data?.email_available ?? false} />
    </SettingsSection>
    <QueryState query={account} loading={<PreferencesLoading />}>{account.data && <p className="mb-4 text-[13px]/7 text-muted">
      {!account.data.email_available ? "Email delivery isn’t configured. " : !account.data.email_enabled ? "Email notifications are off in your account. " : "Email uses your account’s categories and severity levels. "}
      <Link href="/account?section=notifications" className="text-accent hover:underline">Manage account preferences →</Link>
    </p>}</QueryState>
    <PreferenceStatus pending={save.isPending} error={save.error} saved={save.isSuccess} />
  </>}</QueryState>;
}
