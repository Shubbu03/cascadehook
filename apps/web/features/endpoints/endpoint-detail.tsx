"use client";

import { Status } from "@/components/status";

import { Button, buttonStyles } from "@/components/button";

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
import { useEffect, useId, useState, type SubmitEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { DocsLink } from "@/components/docs-link";
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

export function EndpointDetail({ endpointId }: { endpointId: string; }) {
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
        <Link href={href + "/endpoints"} className="inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='notice']:[font-size:inherit] in-data-[ui~='notice']:underline in-data-[ui~='notice']:underline-offset-[3px] in-data-[ui~='notice']:ml-1.25 in-data-[ui~='endpoint-security-card']:text-[12px] in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_[data-ui~='endpoint-detail']_>_&:first-child]:mb-3 max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]">
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
    <section data-ui="endpoint-detail" className="max-w-300 [container:endpoint-settings/inline-size]" aria-labelledby="endpoint-title">
      <Link href={href + "/endpoints"} className="inline-flex items-center text-[13px] font-medium text-muted gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='notice']:[font-size:inherit] in-data-[ui~='notice']:underline in-data-[ui~='notice']:underline-offset-[3px] in-data-[ui~='notice']:ml-1.25 in-data-[ui~='endpoint-security-card']:text-[12px] in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_[data-ui~='endpoint-detail']_>_&:first-child]:mb-3 max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]">
        <ArrowLeftIcon size={16} aria-hidden="true" />
        Endpoints
      </Link>
      <PageHeader variant="endpoint"
        title="Endpoint settings"
        titleId="endpoint-title"
        actions={
          <>
            <Link
              data-ui="button" className={buttonStyles({ variant: "quiet", size: "small", className: "leading-[1.4]" })}
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
                <Button
                  type="button"
                  data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
                  disabled={save.isPending}
                  onClick={() => {
                    setDraft(null);
                    setInputErrors({});
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form={formId}
                  data-ui="button" size="small" className="leading-[1.4]"
                  disabled={save.isPending}
                >
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
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
              </Button>
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
        <p className="text-danger text-[13px] my-3 [[data-ui~='endpoint-danger']_>_&]:basis-full [[data-ui~='endpoint-danger']_>_&]:text-danger" role="alert">
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
      <div className="rounded-[10px] bg-surface grid grid-cols-[minmax(0,1fr)_minmax(270px,0.55fr)] mb-4 border border-solid border-border @max-[38.75rem]/endpoint-settings:grid-cols-[1fr]">
        <section
          className="min-w-0 py-5 px-5.5 @max-[38.75rem]/endpoint-settings:p-4"
          aria-labelledby="destination-title"
        >
          <div data-ui="endpoint-panel-heading" className="flex items-center flex-wrap gap-2 [&_>_svg]:shrink-0 [&_>_svg]:text-muted [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-sm/normal">
            <LinkSimpleIcon size={18} aria-hidden="true" />
            <h2 id="destination-title">Destination URL</h2>
          </div>
          {editing && draft ? (
            <div data-ui="endpoint-inline-fields" className="mt-3 [&_input]:font-mono [&_textarea]:font-mono [&_textarea]:min-h-24 [&_textarea]:bg-surface-hover">
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
                <p data-ui="notice" className="rounded-lg bg-warning-subtle text-warning my-4 border border-solid border-border mt-3 mb-0 text-[12px] py-2.5 px-3">
                  Changing the URL disables delivery and clears verification.
                  Verify the new receiver before enabling delivery again.
                </p>
              )}
            </div>
          ) : (
            <div data-ui="endpoint-destination-url" className="flex items-start mt-2.5 gap-2">
              <code className="block wrap-anywhere font-mono text-[13px] leading-[1.7] flex-1 min-w-0 text-foreground py-1.25">{current.url}</code>
              <CopyButton
                value={current.url}
                label="Copy destination URL"
                successMessage="Destination URL copied."
                iconOnly
              />
            </div>
          )}
          <dl data-ui="endpoint-metadata" className="flex items-center flex-wrap gap-y-1 gap-x-2.5 mt-4 mb-0 text-muted text-[11px] mx-0 [&_dd]:flex [&_dd]:items-center [&_dd]:min-w-0 [&_dd]:gap-1 [&_dd]:m-0 [&_code]:wrap-anywhere @max-[38.75rem]/endpoint-settings:block @max-[38.75rem]/endpoint-settings:mt-3 @max-[38.75rem]/endpoint-settings:[&_dd]:mt-0.5">
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
        <section className="min-w-0 border-l [border-left-style:solid] border-l-border bg-background rounded-[0_9px_9px_0] py-5 px-5.5 @max-[38.75rem]/endpoint-settings:border-t @max-[38.75rem]/endpoint-settings:[border-top-style:solid] @max-[38.75rem]/endpoint-settings:border-t-border @max-[38.75rem]/endpoint-settings:border-l-0 @max-[38.75rem]/endpoint-settings:[border-left-style:none] @max-[38.75rem]/endpoint-settings:border-l-[currentColor] @max-[38.75rem]/endpoint-settings:rounded-[0_0_9px_9px] @max-[38.75rem]/endpoint-settings:p-4" aria-labelledby="delivery-title">
          <div data-ui="endpoint-panel-heading" className="flex items-center flex-wrap gap-2 [&_>_svg]:shrink-0 [&_>_svg]:text-muted [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-sm/normal">
            <h2 id="delivery-title">Delivery</h2>
            <Status
              tone={(current.enabled ? "success" : !current.has_signing_secret || !current.verified_at ? "warning" : "neutral")}
            >
              {endpointState(current)}
            </Status>
          </div>
          <p className="mt-2 mb-3.5 text-muted text-[13px] leading-[1.65] wrap-anywhere [[data-ui~='endpoint-security-card']_>_&:last-child]:mb-0" id="delivery-description">
            {current.enabled
              ? "Delivery is enabled for subscribed events."
              : current.has_signing_secret && current.verified_at
                ? "Ready to receive events. Enable delivery to start sending."
                : "Configure a signing secret and verify your receiver to enable delivery."}
          </p>
          {canManage && (
            <Button
              type="button"
              size="small"
              variant={current.enabled ? "secondary" : "primary"}
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
            </Button>
          )}
          {toggle.error && (
            <p className="text-danger text-[13px] my-3 [[data-ui~='endpoint-danger']_>_&]:basis-full [[data-ui~='endpoint-danger']_>_&]:text-danger" role="alert">
              {toggle.error.message}
            </p>
          )}
        </section>
      </div>
      <div className="rounded-[10px] bg-surface border border-solid border-border">
        <section
          className="min-w-0 border-b [border-bottom-style:solid] border-b-border py-5 px-5.5 @max-[38.75rem]/endpoint-settings:p-4"
          aria-labelledby="subscriptions-title"
        >
          <div data-ui="endpoint-panel-heading" className="flex items-center flex-wrap gap-2 [&_>_svg]:shrink-0 [&_>_svg]:text-muted [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-sm/normal">
            <h2 id="subscriptions-title">Event subscriptions</h2>
            <span className="text-muted text-[12px]">
              {current.event_types.length} event{" "}
              {current.event_types.length === 1 ? "type" : "types"}
            </span>
          </div>
          {editing && draft ? (
            <div data-ui="endpoint-inline-fields" className="mt-3 [&_input]:font-mono [&_textarea]:font-mono [&_textarea]:min-h-24 [&_textarea]:bg-surface-hover">
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
              <p className="mt-2 mb-3.5 text-muted text-[13px] leading-[1.65] wrap-anywhere [[data-ui~='endpoint-security-card']_>_&:last-child]:mb-0">
                Only events matching these exact types are delivered here.
              </p>
              <ul className="flex flex-wrap list-none m-0 p-0 [&_li]:rounded-[5px] [&_li]:wrap-anywhere [&_li]:max-w-full [&_li]:border [&_li]:border-solid [&_li]:border-border gap-1.5 [&_li]:bg-background [&_li]:text-[11px] [&_li]:py-1 [&_li]:px-2">
                {current.event_types.map((type) => (
                  <li key={type}><code>{type}</code></li>
                ))}
              </ul>
            </>
          )}
        </section>
        <div className="grid grid-cols-2 @max-[47.5rem]/endpoint-settings:grid-cols-[1fr]">
          {canManage ? (
            <SigningSecret
              endpoint={current}
              busy={busy}
              onBusyChange={setSecretBusy}
            />
          ) : (
            <section
              id="signing-secret"
              data-ui="endpoint-security-card" className="min-w-0 py-5 px-5.5 [[data-ui~='endpoint-security-card']+&]:border-l [[data-ui~='endpoint-security-card']+&]:[border-left-style:solid] [[data-ui~='endpoint-security-card']+&]:border-l-border @max-[38.75rem]/endpoint-settings:p-4 @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-t @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:[border-top-style:solid] @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-t-border @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-l-0 @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:[border-left-style:none] @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-l-[currentColor]"
              aria-labelledby="signing-secret-title"
            >
              <div data-ui="endpoint-panel-heading" className="flex items-center flex-wrap gap-2 [&_>_svg]:shrink-0 [&_>_svg]:text-muted [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-sm/normal">
                <KeyIcon size={18} aria-hidden="true" />
                <h2 id="signing-secret-title">Signing secret</h2>
                <Status
                  tone={(current.has_signing_secret ? "success" : "warning")}
                >
                  {current.has_signing_secret ? "Configured" : "Not configured"}
                </Status>
              </div>
              <p className="mt-2 mb-3.5 text-muted text-[13px] leading-[1.65] wrap-anywhere [[data-ui~='endpoint-security-card']_>_&:last-child]:mb-0">
                {current.has_signing_secret
                  ? "A signing secret is configured for this endpoint."
                  : "An owner or admin needs to configure a signing secret."}
              </p>
            </section>
          )}
          <section
            id="receiver-verification"
            data-ui="endpoint-security-card" className="min-w-0 py-5 px-5.5 [[data-ui~='endpoint-security-card']+&]:border-l [[data-ui~='endpoint-security-card']+&]:[border-left-style:solid] [[data-ui~='endpoint-security-card']+&]:border-l-border @max-[38.75rem]/endpoint-settings:p-4 @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-t @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:[border-top-style:solid] @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-t-border @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-l-0 @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:[border-left-style:none] @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-l-[currentColor]"
            aria-labelledby="verification-title"
          >
            <div data-ui="endpoint-panel-heading" className="flex items-center flex-wrap gap-2 [&_>_svg]:shrink-0 [&_>_svg]:text-muted [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-sm/normal">
              <ShieldCheckIcon size={18} aria-hidden="true" />
              <h2 id="verification-title">Receiver verification</h2>
              <Status
                tone={(current.verified_at ? "success" : "warning")}
              >
                {current.verified_at ? (
                  <>
                    <CheckCircleIcon size={13} aria-hidden="true" />
                    Verified
                  </>
                ) : (
                  "Not verified"
                )}
              </Status>
            </div>
            <p className="mt-2 mb-3.5 text-muted text-[13px] leading-[1.65] wrap-anywhere [[data-ui~='endpoint-security-card']_>_&:last-child]:mb-0">
              {current.verified_at
                ? "This destination has passed the signed ownership challenge."
                : "Your receiver must validate our signature and return the challenge proof. A plain 200 response is not enough."}
            </p>
            <DocsLink
              path="/docs/security/verification"
              className="text-accent inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='notice']:[font-size:inherit] in-data-[ui~='notice']:underline in-data-[ui~='notice']:underline-offset-[3px] in-data-[ui~='notice']:ml-1.25 text-[12px] in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_[data-ui~='endpoint-detail']_>_&:first-child]:mb-3 max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
            >
              Receiver setup guide
              <ArrowRightIcon size={14} aria-hidden="true" />
            </DocsLink>
            {canManage && !current.verified_at && (
              <div className="grid justify-items-start mt-3.5 gap-2">
                {!current.has_signing_secret && (
                  <p className="text-[12px] text-muted leading-[1.7]">
                    Generate a signing secret and configure your receiver first.
                  </p>
                )}
                <Button
                  type="button"
                  data-ui="button" variant="secondary" size="small" className="leading-[1.4]"
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
                </Button>
                <p className="text-[12px] text-muted leading-[1.7]">
                  Sends a signed challenge. One attempt every 30 seconds.
                </p>
              </div>
            )}
            {verify.error && (
              <p className="text-danger text-[13px] my-3 [[data-ui~='endpoint-danger']_>_&]:basis-full [[data-ui~='endpoint-danger']_>_&]:text-danger" role="alert">
                {verify.error.message}
              </p>
            )}
          </section>
        </div>
      </div>
      {canManage && (
        <section
          data-ui="endpoint-danger" className="flex items-center flex-wrap gap-y-3 gap-x-6 mt-5 border-t [border-top-style:solid] border-t-border py-4.5 [&_>_div]:flex-[1_1_320px] [&_h2]:text-[13px] [&_h2]:font-medium [&_p]:mt-1 [&_p]:text-muted [&_p]:text-[12px] [&_p]:leading-[1.65] @max-[38.75rem]/endpoint-settings:items-start @max-[38.75rem]/endpoint-settings:mt-4 @max-[38.75rem]/endpoint-settings:pt-4"
          aria-labelledby="delete-endpoint-title"
        >
          <div>
            <h2 id="delete-endpoint-title">Delete endpoint</h2>
            <p>
              Cancels pending deliveries. Requests in flight may finish.
              Delivery history is kept.
            </p>
          </div>
          <Button
            type="button"
            data-ui="button" variant="secondary" size="small" className="text-danger leading-[1.4]"
            disabled={busy}
            onClick={() => {
              remove.reset();
              setDeleteConfirmation(true);
            }}
          >
            Delete endpoint
          </Button>
          {remove.isError && (
            <p className="text-danger text-[13px] my-3 [[data-ui~='endpoint-danger']_>_&]:basis-full [[data-ui~='endpoint-danger']_>_&]:text-danger" role="alert">
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
          <p className="block wrap-anywhere font-mono text-[13px] leading-[1.7] in-data-[ui~='endpoint-destination-url']:flex-1 in-data-[ui~='endpoint-destination-url']:min-w-0 in-data-[ui~='endpoint-destination-url']:text-foreground in-data-[ui~='endpoint-destination-url']:py-1.25">{current.url}</p>
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
            <p className="text-danger text-[13px] my-3 [[data-ui~='endpoint-danger']_>_&]:basis-full [[data-ui~='endpoint-danger']_>_&]:text-danger" role="alert">
              {toggle.error.message}
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
