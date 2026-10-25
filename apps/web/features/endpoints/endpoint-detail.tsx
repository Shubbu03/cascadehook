"use client";

import { useAuth } from "@clerk/nextjs";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  PencilSimpleIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { ConnectionError } from "@/features/workspace/connection-error";
import { ContentLoading } from "@/features/workspace/loading";
import { useSessionUserId } from "@/features/workspace/session";
import { ApiError, apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import { EndpointForm } from "./endpoint-form";
import { SigningSecret } from "./signing-secret";
import {
  endpointKeys,
  endpointPath,
  endpointState,
  type Endpoint,
} from "./types";

export function EndpointDetail({ endpointId }: { endpointId: string }) {
  const { project, canManage, suspended, availabilityKnown } = useProject();
  const userId = useSessionUserId();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [secretBusy, setSecretBusy] = useState(false);
  const [disableConfirmation, setDisableConfirmation] = useState(false);
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
  const remaining = Math.max(
    0,
    Math.ceil((cooldown.until - cooldown.now) / 1000),
  );
  const busy = verify.isPending || toggle.isPending || secretBusy;
  if (endpoint.isPending) return <ContentLoading />;
  if (endpoint.isError && !endpoint.data)
    return (
      <ConnectionError
        error={endpoint.error}
        retry={() => {
          void endpoint.refetch();
        }}
        pending={endpoint.isFetching}
      />
    );
  if (!endpoint.data) return null;
  const current = endpoint.data;
  if (editing && canManage)
    return (
      <section>
        <PageHeader title="Edit endpoint" />
        <EndpointForm
          endpoint={current}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </section>
    );

  return (
    <section>
      <Link href={href + "/endpoints"} className="text-link workspace-muted">
        <ArrowLeftIcon size={16} aria-hidden="true" />
        Endpoints
      </Link>
      <PageHeader
        title="Endpoint settings"
        description={
          <>
            <div className="endpoint-url">{current.url}</div>
            <Link
              className="text-link"
              href={
                href +
                "/deliveries?endpoint_id=" +
                encodeURIComponent(endpointId)
              }
            >
              View deliveries →
            </Link>
          </>
        }
        actions={
          canManage && (
            <button
              type="button"
              className="button button-small button-secondary"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <PencilSimpleIcon size={16} aria-hidden="true" />
              Edit endpoint
            </button>
          )
        }
      />
      {endpoint.isError && (
        <ConnectionError
          error={endpoint.error}
          retry={() => {
            void endpoint.refetch();
          }}
          pending={endpoint.isFetching}
        />
      )}
      <div className="endpoint-summary">
        <div>
          <span className="field-label">Delivery status</span>
          <span
            className={
              "status " +
              (current.enabled ? "status-success" : "status-neutral")
            }
          >
            {endpointState(current)}
          </span>
        </div>
        <div>
          <span className="field-label">Endpoint ID</span>
          <code>{current.id}</code>
          <CopyButton
            value={current.id}
            label="Copy ID"
            successMessage="Endpoint ID copied."
          />
        </div>
      </div>
      <section className="endpoint-section">
        <h3>Event subscriptions</h3>
        <p className="section-description">
          Only events with these exact types are routed to this endpoint.
        </p>
        <ul className="event-type-list">
          {current.event_types.map((type) => (
            <li key={type}>
              <code>{type}</code>
            </li>
          ))}
        </ul>
      </section>
      {canManage ? (
        <SigningSecret
          endpoint={current}
          busy={busy}
          onBusyChange={setSecretBusy}
        />
      ) : (
        <section className="endpoint-section">
          <h3>Signing secret</h3>
          <p className="section-description">
            {current.has_signing_secret
              ? "A signing secret is configured."
              : "An owner or admin needs to configure a signing secret."}
          </p>
        </section>
      )}
      <section className="endpoint-section">
        <div className="endpoint-section-title">
          <ShieldCheckIcon size={21} aria-hidden="true" />
          <h3>Receiver verification</h3>
        </div>
        <p className="section-description">
          {current.verified_at
            ? "This destination has passed the signed ownership challenge."
            : "Your receiver must validate our signature and return the challenge proof. A plain 200 response is not enough."}
        </p>
        <Link href={href + "/receiver-guide"} className="text-link text-accent">
          Read the receiver guide
          <ArrowSquareOutIcon size={16} aria-hidden="true" />
        </Link>
        {current.verified_at && (
          <p className="verification-complete">
            <CheckCircleIcon size={18} aria-hidden="true" />
            Verified
          </p>
        )}
        {canManage && !current.verified_at && (
          <div className="verification-action">
            {!current.has_signing_secret && (
              <p className="field-help">
                Generate a signing secret and configure your receiver first.
              </p>
            )}
            <button
              type="button"
              className="button button-secondary"
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
              Verification sends a signed challenge to your receiver. Attempts
              are limited to once every 30 seconds.
            </p>
          </div>
        )}
        {verify.error && (
          <p className="form-error" role="alert">
            {verify.error.message}
          </p>
        )}
      </section>
      <section className="endpoint-section">
        <h3>Delivery</h3>
        <p className="section-description">
          {current.enabled
            ? "This endpoint is enabled. Subscribed events can be delivered here."
            : "Enable delivery after the signing secret is installed and ownership is verified."}
        </p>
        {canManage && (
          <button
            type="button"
            className={
              "button " +
              (current.enabled ? "button-secondary" : "button-primary")
            }
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
