"use client";

import { Select } from "@/components/select";
import { useAuth, useClerk } from "@clerk/nextjs";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { useSessionUserId } from "@/features/workspace/session";
import { accountQuery } from "@/features/workspace/queries";
import { deletionToken } from "./deletion";
import { MemberIdentity, memberName } from "./member-identity";
import type {
  Organization,
  OrganizationRole,
  Page,
} from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { Membership } from "./types";

type MemberAction =
  | { member: Membership; role: OrganizationRole }
  | { member: Membership; remove: true };

export function Members({ organization }: { organization: Organization }) {
  const userId = useSessionUserId();
  const { getToken, sessionId } = useAuth();
  const clerk = useClerk();
  const account = useQuery(accountQuery(userId, getToken));
  const client = useQueryClient();
  const [action, setAction] = useState<MemberAction | null>(null);
  const path =
    "/v1/organizations/" + encodeURIComponent(organization.id) + "/members";
  const key = ["members", userId, organization.id];
  const members = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<Membership>>(path, getToken, {
        signal,
        params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const update = useMutation({
    mutationFn: (action: MemberAction) =>
      apiRequest<unknown>(
        path + "/" + encodeURIComponent(action.member.user_id),
        deletionToken(clerk.session, sessionId, userId),
        "remove" in action
          ? { method: "DELETE" }
          : { method: "PATCH", data: { role: action.role } },
      ),
    onSuccess: () => {
      setAction(null);
      notify("Membership updated.", "success");
    },
    onError: (error) => {
      setAction(null);
      notify(error.message, "error");
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({
          queryKey: ["organization", userId, organization.id],
        }),
        client.invalidateQueries({ queryKey: ["organizations", userId] }),
        client.invalidateQueries({ queryKey: ["project", userId] }),
        client.invalidateQueries({
          queryKey: ["projects", userId, organization.id],
        }),
      ]),
  });
  const items = members.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <section className="settings-section">
      <div className="workspace-section-heading">
        <h2>Members</h2>
        <RefreshButton pending={members.isFetching} refresh={members.refetch} />
      </div>
      {update.isError && (
        <p className="form-error" role="alert">
          {update.error.message}
        </p>
      )}
      <QueryState query={members}>
        {items.some((member) => !member.profile) && (
          <p className="field-help">
            Some member details are unavailable. Account IDs are shown instead.
          </p>
        )}
        <div className="data-table-wrap">
          <table className="data-table members-table">
            <caption className="sr-only">Organization members</caption>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Joined</th>
                {organization.role === "owner" && <th>Manage</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((member) => (
                <tr key={member.user_id}>
                  <td>
                    <MemberIdentity
                      member={member}
                      self={account.data?.id === member.user_id}
                    />
                  </td>
                  <td>{member.role}</td>
                  <td>{formatTime(member.created_at)}</td>
                  {organization.role === "owner" && (
                    <td>
                      <div className="member-actions">
                        <label className="filter-field">
                          <span className="sr-only">
                            Role for {memberName(member)}
                          </span>
                          <Select
                            value={member.role}
                            disabled={update.isPending}
                            onChange={(event) => {
                              update.reset();
                              setAction({
                                member,
                                role: event.target.value as OrganizationRole,
                              });
                            }}
                          >
                            <option value="owner">Owner</option>
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </Select>
                        </label>
                        {account.isSuccess &&
                          account.data.id !== member.user_id && (
                            <button
                              type="button"
                              className="text-link text-danger"
                              disabled={update.isPending}
                              onClick={() => {
                                update.reset();
                                setAction({ member, remove: true });
                              }}
                            >
                              Remove
                            </button>
                          )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LoadMore query={members} />
      </QueryState>
      {action && (
        <ConfirmDialog
          title={
            "remove" in action
              ? "Remove this member?"
              : "Change this member's role?"
          }
          confirmLabel={"remove" in action ? "Remove member" : "Change role"}
          pending={update.isPending}
          onConfirm={() => update.mutate(action)}
          onCancel={() => setAction(null)}
        >
          <p>{memberName(action.member)}</p>
          <p>
            {"remove" in action
              ? "They will lose access to all projects in this organization."
              : "Set role to " +
                action.role +
                ". Owners can manage organization membership and ownership."}
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
