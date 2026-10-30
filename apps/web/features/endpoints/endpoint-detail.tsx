"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  KeyIcon,
  LinkSimpleIcon,
  PencilSimpleIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { docsHref } from "@/lib/docs";
import { useEffect, useId, useState, type SubmitEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { ConnectionError } from "@/features/workspace/connection-error";
import { PageSkeleton } from "@/features/workspace/skeletons";
import { useSessionUserId } from "@/features/workspace/session";
import { deletionToken } from "@/features/settings/deletion";
import { ApiError, apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import {
  EndpointDestinationField,
  EndpointSubscriptionsField,
} from "./endpoint-fields";
import {
  validateEndpointDraft,
  type EndpointDraft,
  type EndpointErrors,
} from "./endpoint-input";
import { SigningSecret } from "./signing-secret";
import { requestEndpointDeletion } from "./deletion";
import {
  endpointKeys,
  endpointPath,
  endpointState,
  type Endpoint,
  type EndpointInput,
} from "./types";

export function EndpointDetail({ endpointId }: { endpointId: string }) {
  const { project, canManage, suspended, availabilityKnown } = useProject();
  const userId = useSessionUserId();
  const { getToken, sessionId } = useAuth();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const formId = useId();
  const [draft, setDraft] = useState<EndpointDraft | null>(null);
  const [inputErrors, setInputErrors] = useState<EndpointErrors>({});
  const editing = canManage && draft !== null;
  const [secretBusy, setSecretBusy] = useState(false);
  const [disableConfirmation, setDisableConfirmation] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [cooldown, setCooldown] = useState({ until: 0, now: 0 });
  const detailKey = endpointKeys.detail(userId, project.id, endpointId);
  const path = endpointPath(project.id, endpointId);
  const href = projectHref(project.id);
  const endpoint = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) => apiRequest<Endpoint>(path, getToken, { signal }),
    staleTime: 0,
  });

  useEffect(() => {
    if (!cooldown.until) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setCooldown((current) => ({ ...current, now }));
      if (now >= cooldown.until) window.clearInterval(interval);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [cooldown.until]);

  function refreshMetadata() {
    void queryClient.invalidateQueries({ queryKey: detailKey });
    void queryClient.invalidateQueries({
      queryKey: endpointKeys.lists(userId, project.id),
    });
    void queryClient.invalidateQueries({
      queryKey: ["project-status", userId, project.id],
    });
  }
  const save = useMutation({
    mutationFn: (input: EndpointInput) =>
      apiRequest<Endpoint>(path, getToken, { method: "PATCH", data: input }),
    onSuccess: (saved) => {
      queryClient.setQueryData(detailKey, saved);
      setDraft(null);
      setInputErrors({});
      notify("Endpoint updated.", "success");
    },
    onError: (error) => notify(error.message, "error"),
    onSettled: refreshMetadata,
  });
  const verify = useMutation({
    mutationFn: () =>
      apiRequest<Endpoint>(path + "/verify", getToken, { method: "POST" }),
    onMutate: () => {
      const now = Date.now();
      setCooldown({ now, until: now + 30_000 });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(detailKey, saved);
      notify("Receiver verified. You can now enable delivery.", "success");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.retryAt > 0)
        setCooldown((current) => ({
          now: Date.now(),
          until: Math.max(current.until, error.retryAt),
        }));
      notify(error.message, "error");
    },
    onSettled: refreshMetadata,
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest<Endpoint>(path, getToken, {
        method: "PATCH",
        data: { enabled },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(detailKey, saved);
      setDisableConfirmation(false);
      notify(
        saved.enabled ? "Delivery enabled." : "Delivery disabled.",
        "success",
      );
    },
    onError: (error) => notify(error.message, "error"),
    onSettled: refreshMetadata,
  });
  const remove = useMutation({
    retry: false,
    mutationFn: () => {
      if (!endpoint.data)
        throw new Error("Refresh the endpoint before deleting.");
      return requestEndpointDeletion(
        project,
        endpoint.data,
        deletionToken(clerk.session, sessionId, userId),
      );
    },
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      if (clerk.user?.id === userId)
        window.location.replace(href + "/endpoints");
    },
    onError: (error) => {
      setDeleteConfirmation(false);
      notify(error.message, "error");
      refreshMetadata();
    },
  });
  const remaining = Math.max(
    0,
    Math.ceil((cooldown.until - cooldown.now) / 1000),
  );
  const busy =
    editing || save.isPending || verify.isPending || toggle.isPending ||
    secretBusy || remove.isPending;

  function submitChanges(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !canManage || save.isPending) return;
    const result = validateEndpointDraft(draft);
    if (!result.valid) {
      setInputErrors(result.errors);
      return;
    }
    setInputErrors({});
    save.mutate(result.input);
  }
  if (endpoint.isPending) return <PageSkeleton variant="endpoint" />;
  if (
    endpoint.isError &&
    (!endpoint.data ||
      (endpoint.error instanceof ApiError &&
        [401, 403, 404, 410].includes(endpoint.error.status)))
  )
    return (
      <section>
        <Link href={href + "/endpoints"} className="text-link">
          ← Endpoints
        </Link>
        <ConnectionError
          error={endpoint.error}
          retry={() => {
            void endpoint.refetch();
          }}
          pending={endpoint.isFetching}
        />
      </section>
    );
  if (!endpoint.data) return null;
  const current = endpoint.data;

  return (
    <section className="endpoint-detail" aria-labelledby="endpoint-title">
      <Link href={href + "/endpoints"} className="text-link workspace-muted">
        <ArrowLeftIcon size={16} aria-hidden="true" />
        Endpoints
      </Link>
      <PageHeader
        title="Endpoint settings"
        titleId="endpoint-title"
        actions={
          <>
            <Link
              className="button button-small button-quiet"
              href={
                href +
                "/deliveries?endpoint_id=" +
                encodeURIComponent(endpointId)
              }
            >
              View deliveries
              <ArrowRightIcon size={16} aria-hidden="true" />
            </Link>
            {canManage && (editing ? (
              <>
                <button
                  type="button"
                  className="button button-small button-secondary"
                  disabled={save.isPending}
                  onClick={() => {
                    setDraft(null);
                    setInputErrors({});
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form={formId}
                  className="button button-small button-primary"
                  disabled={save.isPending}
                >
                  {save.isPending ? "Saving…" : "Save changes"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button button-small button-secondary"
                disabled={busy}
                onClick={() => {
                  save.reset();
                  setInputErrors({});
                  setDraft({
                    url: current.url,
                    eventTypes: current.event_types.join("\n"),
                  });
                }}
              >
                <PencilSimpleIcon size={16} aria-hidden="true" />
                Edit endpoint
              </button>
            ))}
          </>
        }
      />
      {editing && (
        <form
          id={formId}
          onSubmit={submitChanges}
          aria-label="Edit endpoint"
          aria-busy={save.isPending}
          noValidate
        />
      )}
      {editing && save.error && (
        <p className="form-error" role="alert">
          {save.error.message}
        </p>
      )}
      {endpoint.isError && (
        <ConnectionError
          error={endpoint.error}
          retry={() => {
            void endpoint.refetch();
          }}
          pending={endpoint.isFetching}
        />
      )}
      <div className="endpoint-overview">
        <section
          className="endpoint-destination"
          aria-labelledby="destination-title"
        >
          <div className="endpoint-panel-heading">
            <LinkSimpleIcon size={18} aria-hidden="true" />
            <h2 id="destination-title">Destination URL</h2>
          </div>
          {editing && draft ? (
            <div className="endpoint-inline-fields">
              <EndpointDestinationField
                id={formId + "-url"}
                form={formId}
                value={draft.url}
                onChange={(url) => {
                  setDraft((value) => value ? { ...value, url } : null);
                }}
                error={inputErrors.url}
                disabled={save.isPending}
                hideLabel
              />
              {draft.url.trim() !== current.url && (
                <p className="notice notice-warning">
                  Changing the URL disables delivery and clears verification.
                  Verify the new receiver before enabling delivery again.
                </p>
              )}
            </div>
          ) : (
            <div className="endpoint-destination-url">
              <code className="endpoint-url">{current.url}</code>
              <CopyButton
                value={current.url}
                label="Copy destination URL"
                successMessage="Destination URL copied."
                iconOnly
              />
            </div>
          )}
          <dl className="endpoint-metadata">
            <dt>Endpoint ID</dt>
            <dd>
              <code>{current.id}</code>
              <CopyButton
                value={current.id}
                label="Copy endpoint ID"
                successMessage="Endpoint ID copied."
                iconOnly
              />
            </dd>
          </dl>
        </section>
        <section className="endpoint-delivery" aria-labelledby="delivery-title">
          <div className="endpoint-panel-heading">
            <h2 id="delivery-title">Delivery</h2>
            <span
              className={
                "status " +
                (current.enabled
                  ? "status-success"
                  : !current.has_signing_secret || !current.verified_at
                    ? "status-warning"
                    : "status-neutral")
              }
            >
              {endpointState(current)}
            </span>
          </div>
          <p className="endpoint-panel-description" id="delivery-description">
            {current.enabled
              ? "Delivery is enabled for subscribed events."
              : current.has_signing_secret && current.verified_at
                ? "Ready to receive events. Enable delivery to start sending."
                : "Configure a signing secret and verify your receiver to enable delivery."}
          </p>
          {canManage && (
            <button
              type="button"
              className={
                "button button-small " +
                (current.enabled ? "button-secondary" : "button-primary")
              }
              aria-describedby="delivery-description"
              disabled={
                busy ||
                (!current.enabled &&
                  (!current.has_signing_secret ||
                    !current.verified_at ||
                    suspended ||
                    !availabilityKnown))
              }
              onClick={() => {
                if (current.enabled) setDisableConfirmation(true);
                else toggle.mutate(true);
              }}
            >
              {toggle.isPending
                ? "Updating…"
                : current.enabled
                  ? "Disable delivery"
                  : "Enable delivery"}
            </button>
          )}
          {toggle.error && (
            <p className="form-error" role="alert">
              {toggle.error.message}
            </p>
          )}
        </section>
      </div>
      <div className="endpoint-configuration">
        <section
          className="endpoint-subscriptions"
          aria-labelledby="subscriptions-title"
        >
          <div className="endpoint-panel-heading">
            <h2 id="subscriptions-title">Event subscriptions</h2>
            <span className="endpoint-subscription-count">
              {current.event_types.length} event{" "}
              {current.event_types.length === 1 ? "type" : "types"}
            </span>
          </div>
          {editing && draft ? (
            <div className="endpoint-inline-fields">
              <EndpointSubscriptionsField
                id={formId + "-types"}
                form={formId}
                value={draft.eventTypes}
                onChange={(eventTypes) => {
                  setDraft((value) => value ? { ...value, eventTypes } : null);
                }}
                error={inputErrors.eventTypes}
                disabled={save.isPending}
                hideLabel
              />
            </div>
          ) : (
            <>
              <p className="endpoint-panel-description">
                Only events matching these exact types are delivered here.
              </p>
              <ul className="event-type-list">
                {current.event_types.map((type) => (
                  <li key={type}><code>{type}</code></li>
                ))}
              </ul>
            </>
          )}
        </section>
        <div className="endpoint-security-grid">
          {canManage ? (
            <SigningSecret
              endpoint={current}
              busy={busy}
              onBusyChange={setSecretBusy}
            />
          ) : (
            <section
              id="signing-secret"
              className="endpoint-security-card"
              aria-labelledby="signing-secret-title"
            >
              <div className="endpoint-panel-heading">
                <KeyIcon size={18} aria-hidden="true" />
                <h2 id="signing-secret-title">Signing secret</h2>
                <span
                  className={
                    "status " +
                    (current.has_signing_secret
                      ? "status-success"
                      : "status-warning")
                  }
                >
                  {current.has_signing_secret ? "Configured" : "Not configured"}
                </span>
              </div>
              <p className="endpoint-panel-description">
                {current.has_signing_secret
                  ? "A signing secret is configured for this endpoint."
                  : "An owner or admin needs to configure a signing secret."}
              </p>
            </section>
          )}
          <section
            id="receiver-verification"
            className="endpoint-security-card"
            aria-labelledby="verification-title"
          >
            <div className="endpoint-panel-heading">
              <ShieldCheckIcon size={18} aria-hidden="true" />
              <h2 id="verification-title">Receiver verification</h2>
              <span
                className={
                  "status " +
                  (current.verified_at ? "status-success" : "status-warning")
                }
              >
                {current.verified_at ? (
                  <>
                    <CheckCircleIcon size={13} aria-hidden="true" />
                    Verified
                  </>
                ) : (
                  "Not verified"
                )}
              </span>
            </div>
            <p className="endpoint-panel-description">
              {current.verified_at
                ? "This destination has passed the signed ownership challenge."
                : "Your receiver must validate our signature and return the challenge proof. A plain 200 response is not enough."}
            </p>
            <a
              href={docsHref("/docs/security/verification")}
              className="text-link text-accent"
            >
              Receiver setup guide
              <ArrowRightIcon size={14} aria-hidden="true" />
            </a>
            {canManage && !current.verified_at && (
              <div className="verification-action">
                {!current.has_signing_secret && (
                  <p className="field-help">
                    Generate a signing secret and configure your receiver first.
                  </p>
                )}
                <button
                  type="button"
                  className="button button-small button-secondary"
                  disabled={
                    !current.has_signing_secret ||
                    busy ||
                    suspended ||
                    !availabilityKnown ||
                    remaining > 0
                  }
                  onClick={() => verify.mutate()}
                >
                  {verify.isPending
                    ? "Verifying…"
                    : remaining > 0
                      ? "Try again in " + remaining + "s"
                      : "Verify receiver"}
                </button>
                <p className="field-help">
                  Sends a signed challenge. One attempt every 30 seconds.
                </p>
              </div>
            )}
            {verify.error && (
              <p className="form-error" role="alert">
                {verify.error.message}
              </p>
            )}
          </section>
        </div>
      </div>
      {canManage && (
        <section
          className="endpoint-danger"
          aria-labelledby="delete-endpoint-title"
        >
          <div>
            <h2 id="delete-endpoint-title">Delete endpoint</h2>
            <p>
              Cancels pending deliveries. Requests in flight may finish.
              Delivery history is kept.
            </p>
          </div>
          <button
            type="button"
            className="button button-small button-secondary text-danger"
            disabled={busy}
            onClick={() => {
              remove.reset();
              setDeleteConfirmation(true);
            }}
          >
            Delete endpoint
          </button>
          {remove.isError && (
            <p className="form-error" role="alert">
              {remove.error.message}
            </p>
          )}
        </section>
      )}
      {deleteConfirmation && (
        <ConfirmDialog
          title="Delete this endpoint?"
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setDeleteConfirmation(false)}
        >
          <p className="endpoint-url">{current.url}</p>
          <p>Pending deliveries will be canceled. This cannot be undone.</p>
        </ConfirmDialog>
      )}
      {disableConfirmation && (
        <ConfirmDialog
          title="Disable this endpoint?"
          confirmLabel="Disable delivery"
          pending={toggle.isPending}
          onConfirm={() => toggle.mutate(false)}
          onCancel={() => setDisableConfirmation(false)}
        >
          <p>
            Stop deliveries to this endpoint. Requests already in flight may
            still finish. You can enable delivery again later.
          </p>
          {toggle.error && (
            <p className="form-error" role="alert">
              {toggle.error.message}
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
