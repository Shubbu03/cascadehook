"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/button";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { SettingsSkeleton } from "@/features/workspace/skeletons";
import { useSessionUserId } from "@/features/workspace/session";
import type { Account } from "@/features/workspace/types";
import { apiRequest, ApiError } from "@/lib/api";
import { useFormatTime } from "@/lib/display-preferences";
import { DeleteAction } from "./delete-action";
import { deletionToken, ownedOrganizations, requestAccountDeletion } from "./deletion";
import { TimezoneSettings } from "./timezone-settings";
import { AccountNotificationPreferences } from "./notification-preferences";
import { SettingsRow, SettingsSection, SettingsTabs } from "./settings-layout";

export function AccountSettings() {
  const { getToken, sessionId } = useAuth();
  const clerk = useClerk();
  const userId = useSessionUserId();
  const client = useQueryClient();
  const [accepted, setAccepted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const details = useQuery({
    queryKey: ["account-settings", userId],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const [account, organizations] = await Promise.all([
        apiRequest<Account>("/v1/me", getToken, { signal }),
        ownedOrganizations(getToken, signal),
      ]);
      return { account, organizations };
    },
  });
  async function finishSignOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await client.cancelQueries();
      client.clear();
      if (!sessionId) throw new Error("Session unavailable");
      await clerk.signOut({
        sessionId,
        ...(clerk.session?.id === sessionId ? { redirectUrl: "/" } : {}),
      });
    } catch {
      setSignOutError("Sign-out could not finish. Please try again.");
      setSigningOut(false);
    }
  }
  const unavailable = details.error instanceof ApiError && details.error.code === "account_deleted";
  const accountId = details.data?.account.id;
  return (
    <main id="main-content" data-ui="dashboard-main" className="m-0 min-h-[calc(100svh-var(--topbar-height,60px))] w-full min-w-0 px-8 pt-7 pb-16 max-[56.25rem]:px-6 max-[37.5rem]:px-4.5">
      <PageHeader title="Account settings" description="Your profile, sign-in security, and personal notification preferences." />
      {signOutError && <p className="my-3 text-[13px] text-danger" role="alert">{signOutError}</p>}
      {accepted || unavailable ? (
        <div className="max-w-180 rounded-lg border border-border bg-surface p-5 text-[13px]/7" role="status">
          <h2 className="mb-2 text-[17px]">{accepted ? "Account deletion requested" : "Account unavailable"}</h2>
          <p className="mb-4 text-muted">{accepted
            ? "Your access has ended. Data and sign-in account cleanup continues in the background."
            : "This account is no longer available. Sign out to continue."}</p>
          <Button type="button" variant="secondary" onClick={() => { void finishSignOut(); }} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      ) : (
        <QueryState query={details} loading={<SettingsSkeleton />}>
          {details.data && accountId && <SettingsTabs sections={[
            { id: "profile", label: "Profile & security", content: <ProfileSettings account={details.data.account} /> },
            { id: "notifications", label: "Notifications", content: <AccountNotificationPreferences /> },
            { id: "account", label: "Account", content: <>
              <SettingsSection title="Current session" description="Sign out of Cascadehook on this device.">
                <SettingsRow title="Sign out" description="You can sign back in to access your organizations and projects.">
                  <Button type="button" variant="secondary" onClick={() => { void finishSignOut(); }} disabled={signingOut}>
                    {signingOut ? "Signing out…" : "Sign out"}
                  </Button>
                </SettingsRow>
              </SettingsSection>
              <SettingsSection title="Account deletion" description="Permanently remove your account and organization memberships." danger>
                {details.data.organizations.length > 0 ? <div className="py-5">
                  <h3 className="text-[13px] font-medium">Transfer organization ownership first</h3>
                  <p className="mt-2 max-w-170 text-[13px]/7 text-muted">You own the organizations below. Promote another owner and change your own role, or delete the organization, before deleting your account.</p>
                  <ul className="my-4 grid list-none gap-2 p-0">
                    {details.data.organizations.map((organization) => <li key={organization.id}>
                      <Link className="inline-flex min-h-9 items-center text-[13px] font-medium text-accent hover:underline"
                        href={"/dashboard/organizations/" + encodeURIComponent(organization.id) + "/settings?section=team&returnTo=account"}>
                        {organization.name} →
                      </Link>
                    </li>)}
                  </ul>
                  <Button type="button" variant="secondary" className="text-danger" disabled>Delete account</Button>
                </div> : <DeleteAction grouped title="Delete account" confirmationText="DELETE"
                  description="Permanently removes your Cascadehook account and its memberships. Other organizations and their projects remain. Access ends when the request is accepted; account and sign-in identity cleanup runs in the background."
                  onDelete={(confirmation) => requestAccountDeletion(accountId, confirmation, deletionToken(clerk.session, sessionId, userId))}
                  onDeleted={() => { setAccepted(true); void finishSignOut(); }} />}
              </SettingsSection>
            </> },
          ]} />}
        </QueryState>
      )}
    </main>
  );
}

function ProfileSettings({ account }: { account: Account }) {
  const formatTime = useFormatTime();
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  if (!isLoaded || !user) return <SettingsSkeleton />;
  return (
    <>
      <SettingsSection title="Profile" description="Your personal identity is shared across your organizations.">
        <SettingsRow title="Name" description={user.fullName || user.username || "No display name added"}>
          <Button type="button" variant="secondary" size="small" onClick={() => clerk.openUserProfile()}>Manage profile</Button>
        </SettingsRow>
        <SettingsRow title="Primary email" description={user.primaryEmailAddress?.emailAddress || "No primary email added"}>
          <span className="text-[12px] text-muted">{user.primaryEmailAddress?.verification.status === "verified" ? "Verified" : "Not verified"}</span>
        </SettingsRow>
        <SettingsRow title="Account ID" description="Use this ID when contacting support.">
          <div className="flex flex-wrap items-center gap-2 text-[12px]"><code className="break-all">{account.id}</code><CopyButton value={account.id} label="Copy ID" /></div>
        </SettingsRow>
        <SettingsRow title="Member since"><span className="text-[12px] text-muted">{formatTime(account.created_at)}</span></SettingsRow>
      </SettingsSection>
      <SettingsSection title="Sign-in & security" description="Manage your sign-in methods, connected accounts, and active sessions.">
        <SettingsRow title="Account security" description="Review your security settings and devices with access to your account.">
          <Button type="button" variant="secondary" size="small" onClick={() => clerk.openUserProfile({ __experimental_startPath: "/security" })}>Manage security</Button>
        </SettingsRow>
      </SettingsSection>
      <TimezoneSettings />
    </>
  );
}
