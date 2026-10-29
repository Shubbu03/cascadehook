"use client";

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
    <main id="main-content" className="dashboard-main account-settings">
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
            <button
              type="button"
              className="button button-small button-secondary"
              onClick={() => {
                void finishSignOut();
              }}
              disabled={signingOut}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </>
        }
      />
      {signOutError && (
        <p className="form-error" role="alert">
          {signOutError}
        </p>
      )}
      {accepted || unavailable ? (
        <div className="notice" role="status">
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
                <section className="settings-section account-ownership">
                  <h2>Organization ownership</h2>
                  <p className="section-description">
                    Before deleting your account, delete each organization you
                    own or promote another owner and change your own role.
                  </p>
                  <ul>
                    {details.data.organizations.map((organization) => (
                      <li key={organization.id}>
                        <Link
                          className="text-link"
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
                  <p className="field-help">
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
