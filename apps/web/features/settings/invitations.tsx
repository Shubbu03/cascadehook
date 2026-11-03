"use client";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

import { useAuth } from "@clerk/nextjs";
import { PaperPlaneTiltIcon, XIcon } from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, useSyncExternalStore, type SubmitEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Modal } from "@/components/modal";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { Select } from "@/components/select";
import { projectsQuery } from "@/features/workspace/queries";
import { useSessionUserId } from "@/features/workspace/session";
import { TableSkeleton } from "@/features/workspace/skeletons";
import type { Organization, Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { invitationStatus, type Invitation, type InvitationReceipt } from "./types";

function subscribeClock(listener: () => void) {
  const timer = window.setInterval(listener, 5_000);
  return () => window.clearInterval(timer);
}
const clockSnapshot = () => Math.floor(Date.now() / 5_000) * 5_000;
const serverClock = () => 0;
const emailLabels: Record<Invitation["email_status"], string> = {
  not_sent: "Not emailed", queued: "Queued", sending: "Sending", sent: "Sent",
  delivered: "Delivered", failed: "Failed", bounced: "Bounced",
  complained: "Marked as spam", suppressed: "Not deliverable", cancelled: "Cancelled",
};

export function InvitationManagement({ organization }: { organization: Organization; }) {
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Invitation | null>(null);
  const headingId = useId();
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
  const path = "/v1/organizations/" + encodeURIComponent(organization.id) + "/invitations";
  const key = ["invitations", userId, organization.id];
  const list = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => apiRequest<Page<Invitation>>(path, getToken, {
      signal, params: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
    }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: (query) => {
      const loaded = query.state.data?.pages.flatMap((page) => page.data) ?? [];
      if (loaded.some((item) => item.email_status === "queued" || item.email_status === "sending")) return 5_000;
      return loaded.some((item) => item.email_status === "sent" && item.last_email_at
        && clockSnapshot() - Date.parse(item.last_email_at) < 5 * 60_000) ? 15_000 : false;
    },
    refetchOnWindowFocus: true,
  });
  const projects = useInfiniteQuery({ ...projectsQuery(userId, organization.id, getToken), enabled: open });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const invite = useMutation({
    mutationFn: (data: { email: string; role: string; project_id?: string; }) =>
      apiRequest<InvitationReceipt>(path, getToken, { method: "POST", data }),
    onSuccess: () => { setOpen(false); notify("Invitation email queued.", "success"); },
    onSettled: refresh,
  });
  const resend = useMutation({
    mutationFn: (item: Invitation) => apiRequest<void>(path + "/" + item.id + "/resend", getToken, { method: "POST" }),
    onSuccess: () => notify("Invitation email queued again.", "success"),
    onSettled: refresh,
  });
  const revoke = useMutation({
    mutationFn: (item: Invitation) => apiRequest<void>(path + "/" + item.id, getToken, { method: "DELETE" }),
    onSuccess: () => { setTarget(null); notify("Invitation revoked.", "success"); },
    onSettled: refresh,
  });
  const busy = invite.isPending || resend.isPending || revoke.isPending;
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const projectId = String(form.get("project") ?? "");
    invite.mutate({ email: String(form.get("email") ?? "").trim(), role: String(form.get("role") ?? "member"), ...(projectId ? { project_id: projectId } : {}) });
  }

  return (
    <section data-ui="settings-section" className="mt-9 pt-7 border-t [border-top-style:solid] border-t-border [&_>_h3]:text-[19px] [&_>_h3]:mb-4 [&_>_h2]:mb-4 [&_>_h2]:text-[19px] in-data-[ui~='dashboard-main']:mt-7.5 in-data-[ui~='dashboard-main']:pt-6 [[data-ui~='dashboard-main']_&_>_h3]:text-[17px]">
      <div className="flex items-start justify-between mb-5.5 gap-5 [&_h2]:text-[23px] [&_h2]:tracking-[-0.03em] [&_h2]:wrap-anywhere [&_p]:text-muted [&_p]:text-[13px] [&_p]:mt-2 [[data-ui~='dashboard-main']_&_h2]:text-[17px] max-[37.5rem]:flex-wrap max-[37.5rem]:gap-4">
        <div><h2>Invitations</h2><p className="text-[12px] text-muted leading-[1.7] [[data-ui~='settings-section']_>_&]:mt-3 [[data-ui~='settings-section']_>_&]:mb-5 in-data-[ui~='invitation-dialog']:text-[12px] in-data-[ui~='invitation-dialog']:leading-[1.6] in-data-[ui~='invitation-dialog']:m-0">Invite teammates by email. New members can create their account from the invitation.</p></div>
        <div className="flex items-center flex-wrap shrink-0 gap-2.5 max-[37.5rem]:gap-2">
          <RefreshButton pending={list.isFetching} refresh={list.refetch} />
          <Button type="button" data-ui="button" variant="quiet" size="small" className="leading-[1.4] aria-expanded:bg-surface-hover [&:hover:not(:disabled)]:bg-surface-hover" disabled={busy}
            aria-haspopup="dialog" aria-expanded={open}
            onClick={() => { invite.reset(); setOpen(true); }}><PaperPlaneTiltIcon size={16} aria-hidden="true" />Invite member</Button>
        </div>
      </div>
      {(resend.error || revoke.error) && <p className="text-danger text-[13px] my-3 in-data-[ui~='invitation-dialog']:text-[12px] in-data-[ui~='invitation-dialog']:leading-[1.6] in-data-[ui~='invitation-dialog']:text-danger in-data-[ui~='invitation-dialog']:m-0" role="alert">{resend.error?.message ?? revoke.error?.message}</p>}
      <QueryState query={list} loading={<TableSkeleton columns={6} rows={3} label="Loading invitations…" />}>
        {items.length ? <div className="max-w-full overflow-x-auto rounded-[9px] bg-surface border border-solid border-border in-data-[ui~='organization-settings']:mt-5"><table data-ui="data-table" className="w-full border-collapse text-[13px] text-left [&_th]:border-b [&_th]:[border-bottom-style:solid] [&_th]:border-b-border [&_th]:bg-background [&_th]:text-muted [&_th]:text-[12px] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:py-3.25 [&_th]:px-4 [&_td]:align-top [&_td]:leading-[1.7] [&_td]:min-w-27.5 [&_td]:p-4 [&_td_code]:text-[11px] [&_td_code]:wrap-anywhere [&_tr+tr_td]:border-t [&_tr+tr_td]:[border-top-style:solid] [&_tr+tr_td]:border-t-border [[data-ui~='dashboard-main']_&_th]:py-2.75 [[data-ui~='dashboard-main']_&_th]:px-4 [[data-ui~='dashboard-main']_&_td]:min-w-27.5 [[data-ui~='dashboard-main']_&_td]:py-3.25 [[data-ui~='dashboard-main']_&_td]:px-4 [&_tbody_tr:hover]:bg-surface-hover max-[37.5rem]:[&_td]:p-3">
          <caption className="sr-only">Organization invitations and email delivery</caption>
          <thead><tr><th>Email</th><th>Role</th><th>Invitation</th><th>Email delivery</th><th>Expires</th><th>Actions</th></tr></thead>
          <tbody>{items.map((item) => {
            const status = invitationStatus(item, now);
            const coolingDown = !!item.last_email_at && now < Date.parse(item.last_email_at) + 60_000;
            return <tr key={item.id}>
              <td>{item.email}</td><td>{item.role}</td><td>{status}</td>
              <td><span className={"text-muted text-[12px] data-[state=\"delivered\"]:text-success data-[state=\"failed\"]:text-danger data-[state=\"bounced\"]:text-danger data-[state=\"suppressed\"]:text-danger data-[state=\"complained\"]:text-danger"} data-state={item.email_status}>{emailLabels[item.email_status]}</span></td>
              <td>{formatTime(item.expires_at)}</td>
              <td>{status === "Pending" && <div className="flex flex-wrap gap-3.5">
                <button type="button" className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='notice']:[font-size:inherit] in-data-[ui~='notice']:underline in-data-[ui~='notice']:underline-offset-[3px] in-data-[ui~='notice']:ml-1.25 in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent text-[12px] [[data-ui~='settings-section']_>_&]:text-[14px] in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='organization-settings']_>_&:first-child]:mb-4.5 [[data-ui~='organization-settings']_>_&:first-child]:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]" disabled={busy || coolingDown}
                  title={coolingDown ? "Wait one minute between invitation emails" : "Send another invitation email"}
                  onClick={() => { revoke.reset(); resend.mutate(item); }}>{resend.isPending && resend.variables?.id === item.id ? "Queuing…" : item.email_status === "not_sent" ? "Send email" : "Resend"}</button>
                <button type="button" className="text-danger inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='notice']:[font-size:inherit] in-data-[ui~='notice']:underline in-data-[ui~='notice']:underline-offset-[3px] in-data-[ui~='notice']:ml-1.25 in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent text-[12px] [[data-ui~='settings-section']_>_&]:text-[14px] in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='organization-settings']_>_&:first-child]:mb-4.5 [[data-ui~='organization-settings']_>_&:first-child]:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]" disabled={busy}
                  onClick={() => { revoke.reset(); resend.reset(); setTarget(item); }}>Revoke</button>
              </div>}</td>
            </tr>;
          })}</tbody>
        </table></div> : <p data-ui="notice" className="rounded-lg bg-surface text-muted text-[13px] leading-[1.7] my-4 py-3.5 px-4.25 border border-solid border-border">No invitations yet.</p>}
        <LoadMore query={list} />
      </QueryState>
      {open && <Modal data-ui="confirmation-dialog invitation-dialog" className="w-[min(480px,calc(100vw-32px))] max-h-[calc(100svh-48px)] rounded-xl bg-surface text-foreground shadow-floating overflow-y-auto m-auto p-0 border border-solid border-border [&_h2]:text-[22px] [&_h2]:tracking-[-0.03em] [&_p]:mt-4 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.8] backdrop:bg-[#0008] max-[32.5rem]:p-5.75" aria-labelledby={headingId} onDismiss={() => setOpen(false)}>
        <div className="flex items-start justify-between pt-6 pb-5 gap-4 px-6 [&_>_div]:min-w-0 [&_h2]:text-[21px] [&_h2]:font-semibold [&_h2]:leading-[1.3] [&_h2]:m-0">
          <div>
            <h2 id={headingId}>Invite a teammate</h2>
            <p className="[&_strong]:text-foreground [&_strong]:font-medium mt-1.5 mb-0 text-muted text-[13px] leading-normal wrap-anywhere mx-0">to <strong>{organization.name}</strong></p>
          </div>
          <Button type="button" data-ui="button" variant="quiet" size="small" className="leading-[1.4] [&:hover]:text-foreground w-8.5 min-h-8.5 -mt-1 -mr-1.25 mb-0 ml-0 text-muted p-0" aria-label="Close invitation form" onClick={() => setOpen(false)}>
            <XIcon size={18} aria-hidden="true" />
          </Button>
        </div>
        <form onSubmit={submit} aria-busy={invite.isPending}>
          <div className="grid pt-0 pb-6 gap-4.5 px-6">
            <label data-ui="form-field" className="grid [&_>_label]:text-[13px] [&_>_label]:font-medium in-data-[ui~='danger-zone']:max-w-115 min-w-0 gap-1.75 m-0 [&_>_span]:text-[12px] [&_>_span]:font-medium [&_>_span]:m-0 [&_small]:block [&_small]:text-muted [&_small]:m-0 [&_small]:text-xs/normal">
              <span>Email address</span>
              <Input className="[[data-ui~='workspace-create-dialog']_&]:bg-surface-hover [[data-ui~='workspace-create-dialog']_&]:border-0 [[data-ui~='workspace-create-dialog']_&]:border-none [[data-ui~='workspace-create-dialog']_&]:border-current [[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 [[data-ui~='workspace-create-dialog']_&]:focus-visible:outline-hidden [[data-ui~='workspace-create-dialog']_&]:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] placeholder:text-muted w-full min-h-11 rounded-md bg-background text-foreground shadow-[inset_0_-2px_transparent] py-2.5 px-3 border-0 border-none border-current text-sm/normal focus-visible:outline-hidden focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[27.5rem]:text-[16px]" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="teammate@example.com" disabled={busy} />
            </label>
            <div className="grid grid-cols-2 gap-3.5 max-[27.5rem]:grid-cols-[minmax(0,1fr)] max-[27.5rem]:gap-4">
              <label data-ui="form-field" className="grid [&_>_label]:text-[13px] [&_>_label]:font-medium in-data-[ui~='danger-zone']:max-w-115 min-w-0 gap-1.75 m-0 [&_>_span]:text-[12px] [&_>_span]:font-medium [&_>_span]:m-0 [&_small]:block [&_small]:text-muted [&_small]:m-0 [&_small]:text-xs/normal">
                <span>Organization role</span>
                <Select className="bg-position-[right_12px_center] w-full min-h-11 rounded-md bg-background text-foreground shadow-[inset_0_-2px_transparent] py-2.5 px-3 border-0 border-none border-current text-sm/normal focus-visible:outline-hidden focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[27.5rem]:text-[16px]" name="role" defaultValue="member" disabled={busy} aria-describedby={headingId + "-role"}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </Select>
                <small id={headingId + "-role"}>Applies to all projects.</small>
              </label>
              <label data-ui="form-field" className="grid [&_>_label]:text-[13px] [&_>_label]:font-medium in-data-[ui~='danger-zone']:max-w-115 min-w-0 gap-1.75 m-0 [&_>_span]:text-[12px] [&_>_span]:font-medium [&_>_span]:m-0 [&_small]:block [&_small]:text-muted [&_small]:m-0 [&_small]:text-xs/normal">
                <span>Start in</span>
                <Select className="bg-position-[right_12px_center] w-full min-h-11 rounded-md bg-background text-foreground shadow-[inset_0_-2px_transparent] py-2.5 px-3 border-0 border-none border-current text-sm/normal focus-visible:outline-hidden focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[27.5rem]:text-[16px]" name="project" defaultValue="" disabled={busy || projects.isPending} aria-describedby={headingId + "-project"}>
                  <option value="">{projects.isPending ? "Loading projects…" : "All projects"}</option>
                  {projects.data?.pages.flatMap((page) => page.data).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </Select>
                <small id={headingId + "-project"}>Their page after joining.</small>
              </label>
            </div>
            <LoadMore query={projects} label="Load more project options" />
            {projects.error && <p className="text-muted [[data-ui~='settings-section']_>_&]:mt-3 [[data-ui~='settings-section']_>_&]:mb-5 text-[12px] leading-[1.6] m-0">Project options could not be loaded. You can still invite them to the organization.</p>}
            <p className="[&_svg]:shrink-0 [&_svg]:text-accent flex items-center rounded-md bg-surface-hover text-muted gap-2 m-0 py-2.5 px-3 text-xs/normal">
              <PaperPlaneTiltIcon size={15} aria-hidden="true" />
              A personal invitation link, valid for 7 days.
            </p>
            {invite.error && <p className="text-[12px] leading-[1.6] text-danger m-0" role="alert">{invite.error.message}</p>}
          </div>
          <div data-ui="form-actions" className="flex items-center flex-wrap in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6 in-data-[ui~='data-table']:gap-3.5 justify-end border-t [border-top-style:solid] border-t-border bg-surface gap-2 m-0 py-4 px-6">
            <Button type="button" data-ui="button" variant="quiet" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" data-ui="button" disabled={busy}>
              {invite.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </form>
      </Modal>}
      {target && <ConfirmDialog title="Revoke this invitation?" confirmLabel="Revoke invitation" pending={revoke.isPending}
        onConfirm={() => revoke.mutate(target)} onCancel={() => setTarget(null)}>
        <p>{target.email} will no longer be able to join using this invitation.</p>
        {revoke.error && <p className="text-danger text-[13px] my-3 in-data-[ui~='invitation-dialog']:text-[12px] in-data-[ui~='invitation-dialog']:leading-[1.6] in-data-[ui~='invitation-dialog']:text-danger in-data-[ui~='invitation-dialog']:m-0" role="alert">{revoke.error.message}</p>}
      </ConfirmDialog>}
    </section>
  );
}
