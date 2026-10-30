"use client";

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
import { projectPath, stateClass } from "@/features/activity/types";
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
      | { name: string; environment: string; expires_at?: string }
      | { rotate: APIKey },
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
            <button
              type="button"
              className="button button-small button-primary"
              disabled={!canIssue}
              onClick={() => {
                setCreating(!creating);
                setValidation("");
              }}
            >
              Create key
            </button>
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
        <p role="alert" className="form-error">
          {disclosure.state.message} The operation may have completed. Check the
          key list before retrying.
        </p>
      )}
      {revoke.isError && (
        <p role="alert" className="form-error">
          {revoke.error.message}
        </p>
      )}
      {creating && disclosure.state.status !== "revealed" && (
        <form
          className="settings-form"
          onSubmit={create}
          aria-busy={disclosure.state.status === "pending"}
        >
          <label className="form-field">
            <span>Name</span>
            <input
              name="name"
              placeholder="e.g. Billing production"
              required
              disabled={busy}
            />
          </label>
          <label className="filter-field">
            <span>Environment label</span>
            <Select name="environment" defaultValue="dev" disabled={busy}>
              <option value="dev">Development</option>
              <option value="live">Live</option>
            </Select>
          </label>
          <p className="field-help">
            Both labels grant the same access to this project.
          </p>
          <label className="form-field">
            <span>Expiry (optional, your local time)</span>
            <input type="datetime-local" name="expires" disabled={busy} />
          </label>
          {validation && (
            <p className="form-error" role="alert">
              {validation}
            </p>
          )}
          <div className="form-actions">
            <button
              type="submit"
              className="button button-primary"
              disabled={!canIssue}
            >
              {disclosure.state.status === "pending"
                ? "Creating…"
                : "Create key"}
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={busy}
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="activity-filters">
        <label className="filter-field">
          <span>Environment</span>
          <Select
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
          >
            <option value="">All</option>
            <option value="dev">Development</option>
            <option value="live">Live</option>
          </Select>
        </label>
        <label className="filter-field">
          <span>Status</span>
          <Select
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
          <div className="data-table-wrap">
            <table className="data-table">
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
                      <code className="table-secondary">{key.prefix}…</code>
                      <span className="table-secondary">
                        {key.environment === "dev" ? "Development" : "Live"}
                      </span>
                    </td>
                    <td>
                      <span className={"status " + stateClass(key.status)}>
                        {key.status}
                      </span>
                    </td>
                    <td>
                      {formatTime(key.expires_at)}
                      {key.revokes_at && (
                        <span className="table-secondary">
                          Revokes {formatTime(key.revokes_at)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="form-actions">
                        <button
                          type="button"
                          className="text-link"
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
                          className="text-link text-danger"
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
          <div className="empty-state">
            <h3>
              No API keys
              {environment || status ? " match these filters" : " yet"}
            </h3>
            <p>Create a key to publish events from your application.</p>
          </div>
        )}
        <LoadMore query={list} />
      </QueryState>
      <details className="settings-section publication-guide">
        <summary>Publish an event</summary>
        <p className="section-description">
          Replace YOUR_PROJECT_API_KEY and use a new Idempotency-Key for each
          new event. Enable a verified endpoint subscribed to invoice.paid to
          create a delivery.
        </p>
        <CopyButton
          value={example}
          label="Copy example"
          successMessage="Publication example copied."
        />
        <pre className="payload-view">
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
