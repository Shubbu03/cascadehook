"use client";

import { Button } from "@/components/button";

import { SettingsSkeleton } from "@/features/workspace/skeletons";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { QueryState, RefreshButton } from "@/components/query-state";
import { useSessionUserId } from "@/features/workspace/session";
import type { Account } from "@/features/workspace/types";
import { apiRequest, ApiError } from "@/lib/api";
import { DeleteAction } from "./delete-action";
import {
  deletionToken,
  ownedOrganizations,
  requestAccountDeletion,
} from "./deletion";

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
  const unavailable =
    details.error instanceof ApiError &&
    details.error.code === "account_deleted";
  const accountId = details.data?.account.id;
  return (
    <main id="main-content" data-ui="dashboard-main account-settings" className="w-full min-w-0 min-h-[calc(100svh-var(--topbar-height,60px))] pt-7 pb-16 m-0 px-8 max-[56.25rem]:pt-6 max-[56.25rem]:pb-12 max-[56.25rem]:px-6 max-[37.5rem]:pt-5.5 max-[37.5rem]:pb-10 max-[37.5rem]:px-4.5">
      <PageHeader
        title="Account settings"
        actions={
          <>
            {!accepted && !unavailable && (
              <RefreshButton
                pending={details.isFetching}
                refresh={details.refetch}
              />
            )}
            <Button
              type="button"
              data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
              onClick={() => {
                void finishSignOut();
              }}
              disabled={signingOut}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </>
        }
      />
      {signOutError && (
        <p className="text-danger text-[13px] my-3" role="alert">
          {signOutError}
        </p>
      )}
      {accepted || unavailable ? (
        <div data-ui="notice" className="rounded-lg bg-surface text-muted text-[13px] leading-[1.7] my-4 py-3.5 px-4.25 border border-solid border-border [&_h2]:text-[18px] [&_h2]:mb-3" role="status">
          <h2>
            {accepted ? "Account deletion requested" : "Account unavailable"}
          </h2>
          <p>
            {accepted
              ? "Your access has ended. Data and sign-in account cleanup continues in the background."
              : "This account is no longer available. Sign out to continue."}
          </p>
        </div>
      ) : (
        <QueryState query={details} loading={<SettingsSkeleton />}>
          {details.data && accountId && (
            <>
              {details.data.organizations.length ? (
                <section data-ui="settings-section account-ownership" className="border-t [border-top-style:solid] border-t-border [&_>_h3]:mb-4 [&_>_h2]:mb-4 [&_>_h2]:text-[19px] [&_ul]:grid [&_ul]:list-none [&_ul]:gap-3 [&_ul]:p-0 [&_ul]:my-5.5 mt-7.5 pt-6 [&_>_h3]:text-[17px]">
                  <h2>Organization ownership</h2>
                  <p className="mt-3 mb-4.5 text-muted max-w-162.5 text-[13px]">
                    Before deleting your account, delete each organization you
                    own or promote another owner and change your own role.
                  </p>
                  <ul>
                    {details.data.organizations.map((organization) => (
                      <li key={organization.id}>
                        <Link
                          className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='notice']:[font-size:inherit] in-data-[ui~='notice']:underline in-data-[ui~='notice']:underline-offset-[3px] in-data-[ui~='notice']:ml-1.25 in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent text-accent text-[14px] wrap-anywhere [[data-ui~='settings-section']_>_&]:text-[14px] in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]"
                          href={
                            "/dashboard/organizations/" +
                            encodeURIComponent(organization.id) +
                            "/settings?returnTo=account"
                          }
                        >
                          {organization.name} →
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[12px] text-muted leading-[1.7] [[data-ui~='settings-section']_>_&]:mt-3 [[data-ui~='settings-section']_>_&]:mb-5">
                    Other organizations and their projects are not deleted with
                    your account.
                  </p>
                </section>
              ) : (
                <DeleteAction
                  title="Delete account"
                  confirmationText="DELETE"
                  description="Permanently removes your Cascadehook account and its memberships. Other organizations and their projects remain. Access ends when the request is accepted; account and sign-in identity cleanup runs in the background."
                  onDelete={(confirmation) =>
                    requestAccountDeletion(
                      accountId,
                      confirmation,
                      deletionToken(clerk.session, sessionId, userId),
                    )
                  }
                  onDeleted={() => {
                    setAccepted(true);
                    void finishSignOut();
                  }}
                />
              )}
            </>
          )}
        </QueryState>
      )}
    </main>
  );
}
