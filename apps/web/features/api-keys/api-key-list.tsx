"use client";

import { Status } from "@/components/status";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

import { TableSkeleton } from "@/features/workspace/skeletons";
import { Select } from "@/components/select";
import { useAuth } from "@clerk/nextjs";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, type SubmitEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { OneTimeSecret, useOneTimeSecret } from "@/components/one-time-secret";
import { LoadMore, QueryState, RefreshButton } from "@/components/query-state";
import { projectPath, stateTone } from "@/features/activity/types";
import { projectHref, useProject } from "@/features/projects/project-workspace";
import { AccessRedirect } from "@/features/workspace/access-redirect";
import { useSessionUserId } from "@/features/workspace/session";
import type { Page } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { publicationExample } from "@/lib/example";
import { validateKeyReceipt, type APIKey, type KeyReceipt } from "./types";

export function APIKeyList() {
  const { project, canManage } = useProject();
  return canManage ? (
    <KeyManagement />
  ) : (
    <AccessRedirect href={projectHref(project.id)} />
  );
}

function KeyManagement() {
  const { project, availabilityKnown, suspended } = useProject();
  const { getToken } = useAuth();
  const userId = useSessionUserId();
  const client = useQueryClient();
  const disclosure = useOneTimeSecret();
  const [environment, setEnvironment] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [validation, setValidation] = useState("");
  const [confirm, setConfirm] = useState<{
    key: APIKey;
    action: "rotate" | "revoke";
  } | null>(null);
  const path = projectPath(project.id, "api-keys");
  const example = publicationExample.replace(
    "https://YOUR_API_HOST",
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
    "https://YOUR_API_HOST",
  );
  const prefix = ["api-keys", userId, project.id];
  const list = useInfiniteQuery({
    queryKey: [...prefix, environment, status],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<Page<APIKey>>(path, getToken, {
        signal,
        params: {
          limit: 20,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(environment ? { environment } : {}),
          ...(status ? { status } : {}),
        },
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const revoke = useMutation({
    mutationFn: (key: APIKey) =>
      apiRequest<void>(path + "/" + encodeURIComponent(key.id), getToken, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setConfirm(null);
      notify("API key revoked.", "success");
    },
    onError: (error) => {
      setConfirm(null);
      notify(error.message, "error");
    },
    onSettled: () => client.invalidateQueries({ queryKey: prefix }),
  });
  const busy =
    disclosure.state.status === "pending" ||
    disclosure.state.status === "revealed" ||
    revoke.isPending;
  const canIssue = availabilityKnown && !suspended && !busy;
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];

  async function issue(
    options:
      | { name: string; environment: string; expires_at?: string; }
      | { rotate: APIKey; },
  ) {
    setConfirm(null);
    await disclosure.run(async () => {
      try {
        const receipt = validateKeyReceipt(
          await apiRequest<KeyReceipt>(
            "rotate" in options
              ? path + "/" + encodeURIComponent(options.rotate.id) + "/rotate"
              : path,
            getToken,
            {
              method: "POST",
              ...("rotate" in options ? {} : { data: options }),
            },
          ),
          project.id,
        );
        setCreating(false);
        return {
          value: receipt.api_key,
          label: "API key",
          note: receipt.previous_key_revokes_at
            ? "The previous key stops working at " +
            formatTime(receipt.previous_key_revokes_at) +
            ". Update your integration before then."
            : undefined,
        };
      } finally {
        void client.invalidateQueries({ queryKey: prefix });
      }
    });
  }

  function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const expires = String(form.get("expires") ?? "");
    if (!name || [...name].length > 100 || /\p{Cc}/u.test(name)) {
      setValidation("Enter a name with 1–100 characters.");
      return;
    }
    if (
      expires &&
      (!Number.isFinite(Date.parse(expires)) ||
        Date.parse(expires) <= Date.now())
    ) {
      setValidation("Expiry must be in the future.");
      return;
    }
    setValidation("");
    void issue({
      name,
      environment: String(form.get("environment")),
      ...(expires ? { expires_at: new Date(expires).toISOString() } : {}),
    });
  }

  return (
    <section>
      <PageHeader
        title="API keys"
        actions={
          <>
            <RefreshButton pending={list.isFetching} refresh={list.refetch} />
            <Button
              type="button"
              data-ui="button" size="small" className="leading-[1.4]"
              disabled={!canIssue}
              onClick={() => {
                setCreating(!creating);
                setValidation("");
              }}
            >
              Create key
            </Button>
          </>
        }
      />
      {disclosure.state.status === "revealed" && (
        <OneTimeSecret
          secret={disclosure.state.secret}
          close={disclosure.clear}
        />
      )}
      {disclosure.state.status === "error" && (
        <p role="alert" className="text-danger text-[13px] my-3 in-data-[ui~='settings-form']:mb-4">
          {disclosure.state.message} The operation may have completed. Check the
          key list before retrying.
        </p>
      )}
      {revoke.isError && (
        <p role="alert" className="text-danger text-[13px] my-3 in-data-[ui~='settings-form']:mb-4">
          {revoke.error.message}
        </p>
      )}
      {creating && disclosure.state.status !== "revealed" && (
        <form
          data-ui="settings-form" className="max-w-125 rounded-[9px] bg-surface p-5.5 my-6 border border-solid border-border in-data-[ui~='dashboard-main']:max-w-140 in-data-[ui~='dashboard-main']:rounded-none in-data-[ui~='dashboard-main']:bg-transparent in-data-[ui~='dashboard-main']:p-0 in-data-[ui~='dashboard-main']:my-6 in-data-[ui~='dashboard-main']:border-0 in-data-[ui~='dashboard-main']:border-none in-data-[ui~='dashboard-main']:border-current"
          onSubmit={create}
          aria-busy={disclosure.state.status === "pending"}
        >
          <label data-ui="form-field" className="grid mb-4.5 gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium">
            <span>Name</span>
            <Input className="[[data-ui~='workspace-create-dialog']_&]:bg-surface-hover [[data-ui~='workspace-create-dialog']_&]:border-0 [[data-ui~='workspace-create-dialog']_&]:border-none [[data-ui~='workspace-create-dialog']_&]:border-current [[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 [[data-ui~='workspace-create-dialog']_&]:focus-visible:outline-hidden [[data-ui~='workspace-create-dialog']_&]:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted"
              name="name"
              placeholder="e.g. Billing production"
              required
              disabled={busy}
            />
          </label>
          <label data-ui="filter-field" className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium in-data-[ui~='activity-filters']:min-w-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 max-[37.5rem]:in-data-[ui~='activity-filters']:flex-[1_1_150px] max-[37.5rem]:[[data-ui~='dashboard-main']_[data-ui~='activity-filters']_&]:flex-[1_1_140px]">
            <span>Environment label</span>
            <Select className="[[data-ui~='dashboard-main']_&]:w-auto [[data-ui~='dashboard-main']_&]:min-w-37.5 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:pr-10.5 [[data-ui~='dashboard-main']_&]:pl-3.5 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]" name="environment" defaultValue="dev" disabled={busy}>
              <option value="dev">Development</option>
              <option value="live">Live</option>
            </Select>
          </label>
          <p className="text-[12px] text-muted leading-[1.7] mt-3 mb-4.5 [[data-ui~='settings-section']_>_&]:mt-3 [[data-ui~='settings-section']_>_&]:mb-5">
            Both labels grant the same access to this project.
          </p>
          <label data-ui="form-field" className="grid mb-4.5 gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium">
            <span>Expiry (optional, your local time)</span>
            <Input className="[[data-ui~='workspace-create-dialog']_&]:bg-surface-hover [[data-ui~='workspace-create-dialog']_&]:border-0 [[data-ui~='workspace-create-dialog']_&]:border-none [[data-ui~='workspace-create-dialog']_&]:border-current [[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 [[data-ui~='workspace-create-dialog']_&]:focus-visible:outline-hidden [[data-ui~='workspace-create-dialog']_&]:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted" type="datetime-local" name="expires" disabled={busy} />
          </label>
          {validation && (
            <p className="text-danger text-[13px] my-3 mb-4" role="alert">
              {validation}
            </p>
          )}
          <div data-ui="form-actions" className="flex items-center flex-wrap gap-2.5 in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6 in-data-[ui~='data-table']:gap-3.5">
            <Button
              type="submit"
              data-ui="button"
              disabled={!canIssue}
            >
              {disclosure.state.status === "pending"
                ? "Creating…"
                : "Create key"}
            </Button>
            <Button
              type="button"
              data-ui="button" variant="quiet"
              disabled={busy}
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <div data-ui="activity-filters" className="flex [align-items:end] flex-wrap mt-4.5 mb-6 gap-3 in-data-[ui~='dashboard-main']:mt-0 in-data-[ui~='dashboard-main']:mb-5 in-data-[ui~='dashboard-main']:pt-0 in-data-[ui~='dashboard-main']:pb-5 in-data-[ui~='dashboard-main']:border-b in-data-[ui~='dashboard-main']:[border-bottom-style:solid] in-data-[ui~='dashboard-main']:border-b-border in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:mx-0 in-data-[ui~='dashboard-main']:px-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:gap-2.5">
        <label data-ui="filter-field" className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium min-w-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 max-[37.5rem]:flex-[1_1_150px] max-[37.5rem]:[[data-ui~='dashboard-main']_[data-ui~='activity-filters']_&]:flex-[1_1_140px]">
          <span>Environment</span>
          <Select className="[[data-ui~='dashboard-main']_&]:w-auto [[data-ui~='dashboard-main']_&]:min-w-37.5 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:pr-10.5 [[data-ui~='dashboard-main']_&]:pl-3.5 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] max-[37.5rem]:w-full max-[37.5rem]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
          >
            <option value="">All</option>
            <option value="dev">Development</option>
            <option value="live">Live</option>
          </Select>
        </label>
        <label data-ui="filter-field" className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium min-w-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 max-[37.5rem]:flex-[1_1_150px] max-[37.5rem]:[[data-ui~='dashboard-main']_[data-ui~='activity-filters']_&]:flex-[1_1_140px]">
          <span>Status</span>
          <Select className="[[data-ui~='dashboard-main']_&]:w-auto [[data-ui~='dashboard-main']_&]:min-w-37.5 [[data-ui~='dashboard-main']_&]:min-h-9 [[data-ui~='dashboard-main']_&]:pr-10.5 [[data-ui~='dashboard-main']_&]:pl-3.5 [[data-ui~='dashboard-main']_&]:py-1.75 [[data-ui~='dashboard-main']_&]:text-[13px]/5 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:w-full max-[37.5rem]:[[data-ui~='dashboard-main']_&]:min-w-0 max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] max-[37.5rem]:w-full max-[37.5rem]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </Select>
        </label>
      </div>
      <QueryState query={list} loading={<TableSkeleton columns={4} label="Loading API keys…" />}>
        {items.length ? (
          <div className="max-w-full overflow-x-auto rounded-[9px] bg-surface border border-solid border-border">
            <table data-ui="data-table" className="w-full border-collapse text-[13px] text-left [&_th]:border-b [&_th]:[border-bottom-style:solid] [&_th]:border-b-border [&_th]:bg-background [&_th]:text-muted [&_th]:text-[12px] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:py-3.25 [&_th]:px-4 [&_td]:align-top [&_td]:leading-[1.7] [&_td]:min-w-27.5 [&_td]:p-4 [&_td_code]:text-[11px] [&_td_code]:wrap-anywhere [&_tr+tr_td]:border-t [&_tr+tr_td]:[border-top-style:solid] [&_tr+tr_td]:border-t-border [[data-ui~='dashboard-main']_&_th]:py-2.75 [[data-ui~='dashboard-main']_&_th]:px-4 [[data-ui~='dashboard-main']_&_td]:min-w-27.5 [[data-ui~='dashboard-main']_&_td]:py-3.25 [[data-ui~='dashboard-main']_&_td]:px-4 [&_tbody_tr:hover]:bg-surface-hover max-[37.5rem]:[&_td]:p-3">
              <caption className="sr-only">Project API keys</caption>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Status</th>
                  <th>Expiry / revocation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((key) => (
                  <tr key={key.id}>
                    <td>
                      <strong>{key.name}</strong>
                      <code className="block mt-1 text-[11px] text-muted">{key.prefix}…</code>
                      <span className="block mt-1 text-[11px] text-muted">
                        {key.environment === "dev" ? "Development" : "Live"}
                      </span>
                    </td>
                    <td>
                      <Status tone={stateTone(key.status)}>
                        {key.status}
                      </Status>
                    </td>
                    <td>
                      {formatTime(key.expires_at)}
                      {key.revokes_at && (
                        <span className="block mt-1 text-[11px] text-muted">
                          Revokes {formatTime(key.revokes_at)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div data-ui="form-actions" className="flex items-center flex-wrap in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6 gap-3.5">
                        <button
                          type="button"
                          className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='activity-filters']:min-h-9.5 in-data-[ui~='activity-filters']:text-[13px] text-[12px] [[data-ui~='settings-section']_>_&]:text-[14px] in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
                          disabled={
                            !canIssue ||
                            key.status !== "active" ||
                            Boolean(key.rotated_to_id)
                          }
                          onClick={() => {
                            revoke.reset();
                            setConfirm({ key, action: "rotate" });
                          }}
                        >
                          Rotate
                        </button>
                        <button
                          type="button"
                          className="text-danger inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='activity-filters']:min-h-9.5 in-data-[ui~='activity-filters']:text-[13px] text-[12px] [[data-ui~='settings-section']_>_&]:text-[14px] in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
                          disabled={busy || key.status !== "active"}
                          onClick={() => {
                            revoke.reset();
                            setConfirm({ key, action: "revoke" });
                          }}
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div data-ui="empty-state" className="grid justify-items-start rounded-xl bg-surface gap-3.5 p-7 border border-solid border-border [&_h3]:text-[20px] [&_h3]:tracking-[-0.02em] [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7] in-data-[ui~='dashboard-main']:flex in-data-[ui~='dashboard-main']:flex-col in-data-[ui~='dashboard-main']:items-center in-data-[ui~='dashboard-main']:justify-center in-data-[ui~='dashboard-main']:min-h-55 in-data-[ui~='dashboard-main']:bg-transparent in-data-[ui~='dashboard-main']:text-center in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:py-8 in-data-[ui~='dashboard-main']:px-6 in-data-[ui~='dashboard-main']:border-dashed [[data-ui~='dashboard-main']_&_h2]:text-[17px] [[data-ui~='dashboard-main']_&_h2]:m-0 [[data-ui~='dashboard-main']_&_h3]:text-[17px] [[data-ui~='dashboard-main']_&_h3]:m-0 [[data-ui~='dashboard-main']_&_p]:max-w-120 [[data-ui~='dashboard-main']_&_p]:text-[13px] [[data-ui~='dashboard-main']_&_p]:leading-[1.7] [[data-ui~='dashboard-main']_&_p]:m-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:min-h-50 max-[37.5rem]:in-data-[ui~='dashboard-main']:px-4.5">
            <h3>
              No API keys
              {environment || status ? " match these filters" : " yet"}
            </h3>
            <p>Create a key to publish events from your application.</p>
          </div>
        )}
        <LoadMore query={list} />
      </QueryState>
      <details data-ui="settings-section" className="mt-9 pt-7 border-t [border-top-style:solid] border-t-border [&_>_h3]:text-[19px] [&_>_h3]:mb-4 [&_>_h2]:mb-4 [&_>_h2]:text-[19px] in-data-[ui~='dashboard-main']:mt-7.5 in-data-[ui~='dashboard-main']:pt-6 [[data-ui~='dashboard-main']_&_>_h3]:text-[17px]">
        <summary>Publish an event</summary>
        <p className="mt-3 mb-4.5 text-muted text-[14px] leading-[1.8] max-w-162.5 in-data-[ui~='dashboard-main']:text-[13px]">
          Replace YOUR_PROJECT_API_KEY and use a new Idempotency-Key for each
          new event. Enable a verified endpoint subscribed to invoice.paid to
          create a delivery.
        </p>
        <CopyButton
          value={example}
          label="Copy example"
          successMessage="Publication example copied."
        />
        <pre className="max-h-150 mt-4 rounded-[9px] bg-surface overflow-auto text-[12px] leading-[1.8] tab-2 p-5 border border-solid border-border">
          <code>{example}</code>
        </pre>
      </details>
      {confirm && (
        <ConfirmDialog
          title={
            confirm.action === "rotate"
              ? "Rotate this API key?"
              : "Revoke this API key?"
          }
          confirmLabel={
            confirm.action === "rotate" ? "Rotate key" : "Revoke key"
          }
          pending={revoke.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.action === "rotate")
              void issue({ rotate: confirm.key });
            else revoke.mutate(confirm.key);
          }}
        >
          <p>{confirm.key.name}</p>
          <p>
            {confirm.action === "rotate"
              ? "Save the replacement immediately. The previous key remains valid for five minutes."
              : "Integrations using this key will lose access immediately."}
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
