"use client";

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

export function InvitationManagement({ organization }: { organization: Organization }) {
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
    mutationFn: (data: { email: string; role: string; project_id?: string }) =>
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
    <section className="settings-section">
      <div className="workspace-section-heading">
        <div><h2>Invitations</h2><p className="field-help">Invite teammates by email. New members can create their account from the invitation.</p></div>
        <div className="page-heading-actions">
          <RefreshButton pending={list.isFetching} refresh={list.refetch} />
          <button type="button" className="button button-small button-quiet invitation-trigger" disabled={busy}
            aria-haspopup="dialog" aria-expanded={open}
            onClick={() => { invite.reset(); setOpen(true); }}><PaperPlaneTiltIcon size={16} aria-hidden="true" />Invite member</button>
        </div>
      </div>
      {(resend.error || revoke.error) && <p className="form-error" role="alert">{resend.error?.message ?? revoke.error?.message}</p>}
      <QueryState query={list} loading={<TableSkeleton columns={6} rows={3} label="Loading invitations…" />}>
        {items.length ? <div className="data-table-wrap"><table className="data-table">
          <caption className="sr-only">Organization invitations and email delivery</caption>
          <thead><tr><th>Email</th><th>Role</th><th>Invitation</th><th>Email delivery</th><th>Expires</th><th>Actions</th></tr></thead>
          <tbody>{items.map((item) => {
            const status = invitationStatus(item, now);
            const coolingDown = !!item.last_email_at && now < Date.parse(item.last_email_at) + 60_000;
            return <tr key={item.id}>
              <td>{item.email}</td><td>{item.role}</td><td>{status}</td>
              <td><span className="invitation-email-state" data-state={item.email_status}>{emailLabels[item.email_status]}</span></td>
              <td>{formatTime(item.expires_at)}</td>
              <td>{status === "Pending" && <div className="invitation-row-actions">
                <button type="button" className="text-link" disabled={busy || coolingDown}
                  title={coolingDown ? "Wait one minute between invitation emails" : "Send another invitation email"}
                  onClick={() => { revoke.reset(); resend.mutate(item); }}>{resend.isPending && resend.variables?.id === item.id ? "Queuing…" : item.email_status === "not_sent" ? "Send email" : "Resend"}</button>
                <button type="button" className="text-link text-danger" disabled={busy}
                  onClick={() => { revoke.reset(); resend.reset(); setTarget(item); }}>Revoke</button>
              </div>}</td>
            </tr>;
          })}</tbody>
        </table></div> : <p className="notice">No invitations yet.</p>}
        <LoadMore query={list} />
      </QueryState>
      {open && <Modal className="confirmation-dialog invitation-dialog" aria-labelledby={headingId} onDismiss={() => setOpen(false)}>
        <div className="invitation-dialog-heading">
          <div>
            <h2 id={headingId}>Invite a teammate</h2>
            <p className="invitation-dialog-context">to <strong>{organization.name}</strong></p>
          </div>
          <button type="button" className="button button-small button-quiet invitation-close" aria-label="Close invitation form" onClick={() => setOpen(false)}>
            <XIcon size={18} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} aria-busy={invite.isPending}>
          <div className="invitation-dialog-fields">
            <label className="form-field">
              <span>Email address</span>
              <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="teammate@example.com" disabled={busy} />
            </label>
            <div className="invitation-dialog-options">
              <label className="form-field">
                <span>Organization role</span>
                <Select name="role" defaultValue="member" disabled={busy} aria-describedby={headingId + "-role"}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </Select>
                <small id={headingId + "-role"}>Applies to all projects.</small>
              </label>
              <label className="form-field">
                <span>Start in</span>
                <Select name="project" defaultValue="" disabled={busy || projects.isPending} aria-describedby={headingId + "-project"}>
                  <option value="">{projects.isPending ? "Loading projects…" : "All projects"}</option>
                  {projects.data?.pages.flatMap((page) => page.data).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </Select>
                <small id={headingId + "-project"}>Their page after joining.</small>
              </label>
            </div>
            <LoadMore query={projects} label="Load more project options" />
            {projects.error && <p className="field-help">Project options could not be loaded. You can still invite them to the organization.</p>}
            <p className="invitation-dialog-note">
              <PaperPlaneTiltIcon size={15} aria-hidden="true" />
              A personal invitation link, valid for 7 days.
            </p>
            {invite.error && <p className="form-error" role="alert">{invite.error.message}</p>}
          </div>
          <div className="form-actions">
            <button type="button" className="button button-quiet" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>
              {invite.isPending ? "Sending…" : "Send invitation"}
            </button>
          </div>
        </form>
      </Modal>}
      {target && <ConfirmDialog title="Revoke this invitation?" confirmLabel="Revoke invitation" pending={revoke.isPending}
        onConfirm={() => revoke.mutate(target)} onCancel={() => setTarget(null)}>
        <p>{target.email} will no longer be able to join using this invitation.</p>
        {revoke.error && <p className="form-error" role="alert">{revoke.error.message}</p>}
      </ConfirmDialog>}
    </section>
  );
}
