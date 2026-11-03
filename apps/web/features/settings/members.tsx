"use client";

import { TableSkeleton } from "@/features/workspace/skeletons";
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
  | { member: Membership; role: OrganizationRole; }
  | { member: Membership; remove: true; };

export function Members({ organization }: { organization: Organization; }) {
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
    <section data-ui="settings-section" className="mt-9 pt-7 border-t [border-top-style:solid] border-t-border [&_>_h3]:text-[19px] [&_>_h3]:mb-4 [&_>_h2]:mb-4 [&_>_h2]:text-[19px] in-data-[ui~='dashboard-main']:mt-7.5 in-data-[ui~='dashboard-main']:pt-6 [[data-ui~='dashboard-main']_&_>_h3]:text-[17px]">
      <div className="flex items-start justify-between mb-5.5 gap-5 [&_h2]:text-[23px] [&_h2]:tracking-[-0.03em] [&_h2]:wrap-anywhere [&_p]:text-muted [&_p]:text-[13px] [&_p]:mt-2 [[data-ui~='dashboard-main']_&_h2]:text-[17px] max-[37.5rem]:flex-wrap max-[37.5rem]:gap-4">
        <h2>Members</h2>
        <RefreshButton pending={members.isFetching} refresh={members.refetch} />
      </div>
      {update.isError && (
        <p className="text-danger text-[13px] my-3" role="alert">
          {update.error.message}
        </p>
      )}
      <QueryState query={members} loading={<TableSkeleton columns={organization.role === "owner" ? 4 : 3} rows={4} label="Loading members…" />}>
        {items.some((member) => !member.profile) && (
          <p className="text-[12px] text-muted leading-[1.7] [[data-ui~='settings-section']_>_&]:mt-3 [[data-ui~='settings-section']_>_&]:mb-5">
            Some member details are unavailable. Account IDs are shown instead.
          </p>
        )}
        <div className="max-w-full overflow-x-auto rounded-[9px] bg-surface border border-solid border-border in-data-[ui~='organization-settings']:mt-5">
          <table data-ui="data-table" className="w-full border-collapse text-[13px] text-left [&_th]:border-b [&_th]:[border-bottom-style:solid] [&_th]:border-b-border [&_th]:bg-background [&_th]:text-muted [&_th]:text-[12px] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:py-3.25 [&_th]:px-4 [&_td]:align-middle [&_td]:leading-[1.7] [&_td]:min-w-27.5 [&_td]:p-4 [&_td_code]:text-[11px] [&_td_code]:wrap-anywhere [&_tr+tr_td]:border-t [&_tr+tr_td]:[border-top-style:solid] [&_tr+tr_td]:border-t-border [&_th:first-child]:w-[45%] [[data-ui~='dashboard-main']_&_th]:py-2.75 [[data-ui~='dashboard-main']_&_th]:px-4 [[data-ui~='dashboard-main']_&_td]:min-w-27.5 [[data-ui~='dashboard-main']_&_td]:py-3.25 [[data-ui~='dashboard-main']_&_td]:px-4 [&_tbody_tr:hover]:bg-surface-hover max-[37.5rem]:[&_td]:p-3">
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
                      <div data-ui="member-actions" className="flex items-center gap-3">
                        <label data-ui="filter-field" className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium w-37.5 shrink-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5">
                          <span className="sr-only">
                            Role for {memberName(member)}
                          </span>
                          <Select className="[[data-ui~='dashboard-main']_&]:w-auto [[data-ui~='dashboard-main']_&]:min-w-37.5 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:pr-10.5 [[data-ui~='dashboard-main']_&]:pl-3.5 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
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
                              className="text-danger inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent text-[12px] [[data-ui~='settings-section']_>_&]:text-[14px] whitespace-nowrap in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='organization-settings']_>_&:first-child]:mb-4.5 [[data-ui~='organization-settings']_>_&:first-child]:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]"
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
