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
import { useFormatTime } from "@/lib/display-preferences";
import { notify } from "@/lib/notify";
import { publicationExample } from "@/lib/example";
import {
  scopeLabels,
  validateKeyReceipt,
  type APIKey,
  type KeyReceipt,
} from "./types";
import { dataTable, emptyState, errorText, filterBar, filterField, formField, leadText } from "@/components/styles";

export function APIKeyList() {
  const { project, canManage } = useProject();
  return canManage ? (
    <KeyManagement />
  ) : (
    <AccessRedirect href={projectHref(project.id)} />
  );
}

function KeyManagement() {
  const formatTime = useFormatTime();
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
      | { name: string; environment: string; scope: string; expires_at?: string; }
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
      scope: String(form.get("scope")),
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
        <p role="alert" className={errorText}>
          {disclosure.state.message} The operation may have completed. Check the
          key list before retrying.
        </p>
      )}
      {revoke.isError && (
        <p role="alert" className={errorText}>
          {revoke.error.message}
        </p>
      )}
      {creating && disclosure.state.status !== "revealed" && (
        <form
          className="max-w-125 rounded-[9px] bg-surface p-5.5 my-6 border border-solid border-border in-data-[ui~='dashboard-main']:max-w-140 in-data-[ui~='dashboard-main']:rounded-none in-data-[ui~='dashboard-main']:bg-transparent in-data-[ui~='dashboard-main']:p-0 in-data-[ui~='dashboard-main']:my-6 in-data-[ui~='dashboard-main']:border-0 in-data-[ui~='dashboard-main']:border-none in-data-[ui~='dashboard-main']:border-current"
          onSubmit={create}
          aria-busy={disclosure.state.status === "pending"}
        >
          <label className={formField}>
            <span>Name</span>
            <Input className="in-data-[ui~='workspace-create-dialog']:bg-surface-hover in-data-[ui~='workspace-create-dialog']:border-0 in-data-[ui~='workspace-create-dialog']:border-none in-data-[ui~='workspace-create-dialog']:border-current in-data-[ui~='dashboard-main']:min-h-10 in-data-[ui~='dashboard-main']:text-[14px] in-data-[ui~='dashboard-main']:py-2.25 in-data-[ui~='dashboard-main']:px-3 in-data-[ui~='workspace-create-dialog']:focus-visible:outline-hidden in-data-[ui~='workspace-create-dialog']:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:in-data-[ui~='dashboard-main']:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted"
              name="name"
              placeholder="e.g. Billing production"
              required
              disabled={busy}
            />
          </label>
          <label className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5">
            <span>Access</span>
            <Select className="in-data-[ui~='dashboard-main']:w-auto in-data-[ui~='dashboard-main']:min-w-37.5 in-data-[ui~='dashboard-main']:min-h-9 in-data-[ui~='dashboard-main']:pr-10.5 in-data-[ui~='dashboard-main']:pl-3.5 in-data-[ui~='dashboard-main']:py-1.75 in-data-[ui~='dashboard-main']:text-[13px]/5 max-[37.5rem]:in-data-[ui~='dashboard-main']:w-full max-[37.5rem]:in-data-[ui~='dashboard-main']:min-w-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]" name="scope" defaultValue="publish" disabled={busy}>
              <option value="publish">Publish only</option>
              <option value="read">Read only</option>
              <option value="full">Full access</option>
            </Select>
          </label>
          <p className="text-[12px] text-muted leading-[1.7] mt-3 mb-4.5">
            Publish only can send events and check project status. Read only can
            view endpoints, events, and deliveries. Full access can also change
            endpoints, replay deliveries, and manage API keys.
          </p>
          <label className="grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5">
            <span>Environment label</span>
            <Select className="in-data-[ui~='dashboard-main']:w-auto in-data-[ui~='dashboard-main']:min-w-37.5 in-data-[ui~='dashboard-main']:min-h-9 in-data-[ui~='dashboard-main']:pr-10.5 in-data-[ui~='dashboard-main']:pl-3.5 in-data-[ui~='dashboard-main']:py-1.75 in-data-[ui~='dashboard-main']:text-[13px]/5 max-[37.5rem]:in-data-[ui~='dashboard-main']:w-full max-[37.5rem]:in-data-[ui~='dashboard-main']:min-w-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]" name="environment" defaultValue="dev" disabled={busy}>
              <option value="dev">Development</option>
              <option value="live">Live</option>
            </Select>
          </label>
          <p className="text-[12px] text-muted leading-[1.7] mt-3 mb-4.5">
            The label is for your reference only. Access is set above.
          </p>
          <label className={formField}>
            <span>Expiry (optional, your local time)</span>
            <Input className="in-data-[ui~='workspace-create-dialog']:bg-surface-hover in-data-[ui~='workspace-create-dialog']:border-0 in-data-[ui~='workspace-create-dialog']:border-none in-data-[ui~='workspace-create-dialog']:border-current in-data-[ui~='dashboard-main']:min-h-10 in-data-[ui~='dashboard-main']:text-[14px] in-data-[ui~='dashboard-main']:py-2.25 in-data-[ui~='dashboard-main']:px-3 in-data-[ui~='workspace-create-dialog']:focus-visible:outline-hidden in-data-[ui~='workspace-create-dialog']:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:in-data-[ui~='dashboard-main']:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted" type="datetime-local" name="expires" disabled={busy} />
          </label>
          {validation && (
            <p className="text-danger text-[13px] my-3 mb-4" role="alert">
              {validation}
            </p>
          )}
          <div data-ui="form-actions" className="flex items-center flex-wrap gap-2.5 in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6">
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
      <div data-ui="activity-filters" className={filterBar}>
        <label className={filterField}>
          <span>Environment</span>
          <Select className="in-data-[ui~='dashboard-main']:w-auto in-data-[ui~='dashboard-main']:min-w-37.5 in-data-[ui~='dashboard-main']:min-h-9 in-data-[ui~='dashboard-main']:pr-10.5 in-data-[ui~='dashboard-main']:pl-3.5 in-data-[ui~='dashboard-main']:py-1.75 in-data-[ui~='dashboard-main']:text-[13px]/5 max-[37.5rem]:in-data-[ui~='dashboard-main']:w-full max-[37.5rem]:in-data-[ui~='dashboard-main']:min-w-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:text-[16px] max-[37.5rem]:w-full max-[37.5rem]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
          >
            <option value="">All</option>
            <option value="dev">Development</option>
            <option value="live">Live</option>
          </Select>
        </label>
        <label className={filterField}>
          <span>Status</span>
          <Select className="in-data-[ui~='dashboard-main']:w-auto in-data-[ui~='dashboard-main']:min-w-37.5 in-data-[ui~='dashboard-main']:min-h-9 in-data-[ui~='dashboard-main']:pr-10.5 in-data-[ui~='dashboard-main']:pl-3.5 in-data-[ui~='dashboard-main']:py-1.75 in-data-[ui~='dashboard-main']:text-[13px]/5 max-[37.5rem]:in-data-[ui~='dashboard-main']:w-full max-[37.5rem]:in-data-[ui~='dashboard-main']:min-w-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:text-[16px] max-[37.5rem]:w-full max-[37.5rem]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full py-2.25 px-2.75 max-[32.5rem]:text-[16px]"
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
            <table data-ui="data-table" className={dataTable}>
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
                        {" · "}
                        {scopeLabels[key.scope] ?? key.scope}
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
                          className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px]"
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
                          className="text-danger inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px]"
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
          <div data-ui="empty-state" className={emptyState}>
            <h3>
              No API keys
              {environment || status ? " match these filters" : " yet"}
            </h3>
            <p>Create a key to publish events from your application.</p>
          </div>
        )}
        <LoadMore query={list} />
      </QueryState>
      <details data-ui="settings-section" className="mt-9 pt-7 border-t border-t-border [&_>_h3]:text-[19px] [&_>_h3]:mb-4 [&_>_h2]:mb-4 [&_>_h2]:text-[19px] in-data-[ui~='dashboard-main']:mt-7.5 in-data-[ui~='dashboard-main']:pt-6 [[data-ui~='dashboard-main']_&_>_h3]:text-[17px]">
        <summary>Publish an event</summary>
        <p className={leadText}>
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
              ? "Save the replacement immediately. It keeps the same access, and the previous key remains valid for five minutes."
              : "Integrations using this key will lose access immediately."}
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
