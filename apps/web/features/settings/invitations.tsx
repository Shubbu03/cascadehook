"use client";

import { TableSkeleton } from "@/features/workspace/skeletons";
import { Select } from "@/components/select";
import { useAuth } from "@clerk/nextjs";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { OneTimeSecret, useOneTimeSecret } from "@/components/one-time-secret";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { useSessionUserId } from "@/features/workspace/session";
import type { Organization, Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  invitationStatus,
  type Invitation,
  type InvitationReceipt,
} from "./types";

export function InvitationManagement({
  organization,
}: {
  organization: Organization;
}) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const disclosure = useOneTimeSecret();
  const [target, setTarget] = useState<Invitation | null>(null);
  const path =
    "/v1/organizations/" + encodeURIComponent(organization.id) + "/invitations";
  const key = ["invitations", userId, organization.id];
  const list = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<Invitation>>(path, getToken, {
        signal,
        params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const revoke = useMutation({
    mutationFn: (invitation: Invitation) =>
      apiRequest<void>(
        path + "/" + encodeURIComponent(invitation.id),
        getToken,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      setTarget(null);
      notify("Invitation revoked.", "success");
    },
    onError: (error) => {
      setTarget(null);
      notify(error.message, "error");
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const busy =
    disclosure.state.status === "pending" ||
    disclosure.state.status === "revealed" ||
    revoke.isPending;
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const role = String(form.get("role") ?? "member");
    void disclosure.run(async () => {
      try {
        const receipt = await apiRequest<InvitationReceipt>(path, getToken, {
          method: "POST",
          data: { email, role },
        });
        if (
          receipt.invitation?.organization_id !== organization.id ||
          !/^chi_[a-f0-9]{64}$/.test(receipt.token)
        )
          throw new Error(
            "The invitation response was incomplete. Revoke it before creating a replacement.",
          );
        return {
          value:
            window.location.origin +
            "/invitations/accept#token=" +
            encodeURIComponent(receipt.token),
          label: "Invitation link",
          note:
            "Share this link with " +
            receipt.invitation.email +
            ". They must sign in with that verified email. Expires " +
            formatTime(receipt.invitation.expires_at) +
            ".",
        };
      } finally {
        void client.invalidateQueries({ queryKey: key });
      }
    });
  }

  return (
    <section className="settings-section">
      <div className="workspace-section-heading">
        <h2>Invitations</h2>
        <RefreshButton pending={list.isFetching} refresh={list.refetch} />
      </div>
      {disclosure.state.status === "revealed" ? (
        <OneTimeSecret
          secret={disclosure.state.secret}
          close={disclosure.clear}
        />
      ) : (
        <form className="activity-filters" onSubmit={invite}>
          <label className="filter-field">
            <span>Email address</span>
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              disabled={busy}
              placeholder="teammate@example.com"
            />
          </label>
          <label className="filter-field">
            <span>Role</span>
            <Select name="role" defaultValue="member" disabled={busy}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
          </label>
          <button
            type="submit"
            className="button button-small button-primary"
            disabled={busy}
          >
            {disclosure.state.status === "pending"
              ? "Creating…"
              : "Create invitation"}
          </button>
        </form>
      )}
      <p className="field-help">
        Share invitation links yourself. No invitation email is sent
        automatically.
      </p>
      {disclosure.state.status === "error" && (
        <p className="form-error" role="alert">
          {disclosure.state.message} If the request completed without a link,
          revoke that invitation before creating another.
        </p>
      )}
      {revoke.isError && (
        <p className="form-error" role="alert">
          {revoke.error.message}
        </p>
      )}
      <QueryState query={list} loading={<TableSkeleton columns={5} rows={3} label="Loading invitations…" />}>
        {items.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <caption className="sr-only">Organization invitations</caption>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((invitation) => (
                  <tr key={invitation.id}>
                    <td>{invitation.email}</td>
                    <td>{invitation.role}</td>
                    <td>{invitationStatus(invitation)}</td>
                    <td>{formatTime(invitation.expires_at)}</td>
                    <td>
                      {invitationStatus(invitation) === "Pending" && (
                        <button
                          type="button"
                          className="text-link text-danger"
                          disabled={busy}
                          onClick={() => {
                            revoke.reset();
                            setTarget(invitation);
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="notice">No invitations yet.</p>
        )}
        <LoadMore query={list} />
      </QueryState>
      {target && (
        <ConfirmDialog
          title="Revoke this invitation?"
          confirmLabel="Revoke invitation"
          pending={revoke.isPending}
          onConfirm={() => revoke.mutate(target)}
          onCancel={() => setTarget(null)}
        >
          <p>
            {target.email} will no longer be able to use this invitation link.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
