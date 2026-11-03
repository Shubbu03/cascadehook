"use client";

import { Input, Textarea } from "@/components/input";

import { Button } from "@/components/button";

import { useAuth, useClerk } from "@clerk/nextjs";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { projectHref, useProject } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import {
  MAX_EVENT_BYTES,
  preparePublication,
  PublicationError,
  publishEvent,
  type Publication,
  type PublicationErrors,
  type PublicationReceipt,
} from "./publication";

type PublishState =
  | { status: "draft"; }
  | { status: "pending"; publication: Publication; }
  | { status: "error"; publication: Publication; message: string; }
  | {
    status: "accepted";
    publication: Publication;
    receipt: PublicationReceipt;
  };
const initialPayload =
  '{\n  "order_id": "ord_001",\n  "message": "Hello from Cascadehook"\n}';

export function PublishEventForm({
  initialType = "order.created",
  eventTypes,
  onPendingChange,
  onClose,
}: {
  initialType?: string;
  eventTypes?: string[];
  onPendingChange?: (pending: boolean) => void;
  onClose?: () => void;
}) {
  const { project, canManage, availabilityKnown, suspended } = useProject();
  const userId = useSessionUserId();
  const { sessionId } = useAuth();
  const clerk = useClerk();
  const client = useQueryClient();
  const id = useId();
  const [type, setType] = useState(initialType);
  const [payload, setPayload] = useState(initialPayload);
  const [requestKey, setRequestKey] = useState("");
  const [errors, setErrors] = useState<PublicationErrors>({});
  const [state, setState] = useState<PublishState>({ status: "draft" });
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
      pending.current = false;
      onPendingChange?.(false);
      // Cached/hidden routes must not restore a user's payload or an acceptance receipt.
      setType(initialType);
      setPayload(initialPayload);
      setRequestKey("");
      setState({ status: "draft" });
      setErrors({});
    },
    [initialType, onPendingChange],
  );

  const busy = state.status === "pending";
  const locked = state.status !== "draft";
  const blockedReason = !canManage
    ? "Only an owner or admin can publish events."
    : !availabilityKnown
      ? "Check project availability before publishing."
      : suspended
        ? "Publishing is unavailable while this project is paused."
        : undefined;
  const href = projectHref(project.id);

  function newEvent() {
    if (pending.current) return;
    setState({ status: "draft" });
    setRequestKey("");
    setErrors({});
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || blockedReason || state.status === "accepted") return;
    let publication: Publication;
    try {
      publication =
        state.status === "error"
          ? state.publication
          : preparePublication(
            type,
            payload,
            requestKey || "dashboard-" + crypto.randomUUID(),
            eventTypes,
          );
    } catch (error) {
      if (error instanceof PublicationError) setErrors(error.errors);
      else
        setErrors({
          idempotencyKey:
            "Could not generate a request key. Reload before publishing.",
        });
      return;
    }
    pending.current = true;
    const request = new AbortController();
    controller.current = request;
    setRequestKey(publication.idempotencyKey);
    setErrors({});
    setState({ status: "pending", publication });
    onPendingChange?.(true);
    try {
      const session = clerk.session;
      if (!session || session.id !== sessionId || session.user.id !== userId)
        throw new Error(
          "Your signed-in account changed. Reload before publishing.",
        );
      const receipt = await publishEvent(
        project,
        publication,
        () => session.getToken(),
        request.signal,
      );
      if (request.signal.aborted) return;
      setState({ status: "accepted", publication, receipt });
      void Promise.allSettled(
        [
          ["events", userId, project.id],
          ["deliveries", userId, project.id],
          ["project-overview", userId, project.id],
          ["usage", userId, "project", project.id],
          ["usage", userId, "organization", project.organization_id],
        ].map((queryKey) =>
          client.invalidateQueries({ queryKey, refetchType: "all" }),
        ),
      );
    } catch (error) {
      if (!request.signal.aborted)
        setState({
          status: "error",
          publication,
          message:
            error instanceof Error
              ? error.message
              : "The request could not be confirmed.",
        });
    } finally {
      if (controller.current === request) {
        pending.current = false;
        onPendingChange?.(false);
      }
    }
  }

  return (
    <form
      data-ui="event-publish-form" className="min-w-0 [&_p]:text-[12px] [&_p]:leading-[1.7]"
      onSubmit={submit}
      aria-busy={busy}
      noValidate
    >
      <label data-ui="form-field" className="grid gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium mb-3.5" htmlFor={id + "-type"}>
        <span>Event type</span>
        <Input className="[[data-ui~='workspace-create-dialog']_&]:bg-surface-hover [[data-ui~='workspace-create-dialog']_&]:border-0 [[data-ui~='workspace-create-dialog']_&]:border-none [[data-ui~='workspace-create-dialog']_&]:border-current [[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 [[data-ui~='workspace-create-dialog']_&]:focus-visible:outline-hidden [[data-ui~='workspace-create-dialog']_&]:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted font-mono"
          id={id + "-type"}
          value={type}
          onChange={(event) => setType(event.target.value)}
          placeholder="order.created"
          list={eventTypes ? id + "-types" : undefined}
          required
          maxLength={128}
          readOnly={locked}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(errors.type)}
          aria-describedby={errors.type ? id + "-type-error" : undefined}
        />
      </label>
      {eventTypes && (
        <datalist id={id + "-types"}>
          {eventTypes.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      )}
      {errors.type && (
        <p id={id + "-type-error"} className="text-[13px] my-3 [[data-ui~='event-publish-form']_>_&]:-mt-1 [[data-ui~='event-publish-form']_>_&]:mb-4.5 text-danger" role="alert">
          {errors.type}
        </p>
      )}
      <label data-ui="form-field" className="grid gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium mb-3.5" htmlFor={id + "-payload"}>
        <span>JSON payload</span>
        <Textarea className="w-full resize-y rounded-md text-foreground font-normal text-[14px] leading-[1.7] font-mono p-3 max-[32.5rem]:text-[16px] min-h-40 tab-2 bg-surface-hover"
          id={id + "-payload"}
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          rows={7}
          required
          maxLength={MAX_EVENT_BYTES}
          readOnly={locked}
          disabled={busy}
          spellCheck={false}
          aria-invalid={Boolean(errors.payload)}
          aria-describedby={id + "-payload-help"}
        />
      </label>
      <p
        id={id + "-payload-help"}
        className={(errors.payload) ? "text-[13px] my-3 [[data-ui~='event-publish-form']_>_&]:-mt-1 [[data-ui~='event-publish-form']_>_&]:mb-4.5 text-danger" : "text-[12px] text-muted leading-[1.7] [[data-ui~='event-publish-form']_>_&]:-mt-1 [[data-ui~='event-publish-form']_>_&]:mb-4.5"}
        role={errors.payload ? "alert" : undefined}
      >
        {errors.payload ??
          "Sent as the event’s data. Maximum complete event size: 256 KiB."}
      </p>
      <label data-ui="form-field" className="grid mt-5 gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium mb-3.5" htmlFor={id + "-key"}>
        <span>
          Idempotency key <span className="text-muted text-[13px]">(optional)</span>
        </span>
        <Input className="[[data-ui~='workspace-create-dialog']_&]:bg-surface-hover [[data-ui~='workspace-create-dialog']_&]:border-0 [[data-ui~='workspace-create-dialog']_&]:border-none [[data-ui~='workspace-create-dialog']_&]:border-current [[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 [[data-ui~='workspace-create-dialog']_&]:focus-visible:outline-hidden [[data-ui~='workspace-create-dialog']_&]:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted font-mono"
          id={id + "-key"}
          value={requestKey}
          onChange={(event) => setRequestKey(event.target.value)}
          placeholder="Generated automatically"
          maxLength={255}
          readOnly={locked}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(errors.idempotencyKey)}
          aria-describedby={
            errors.idempotencyKey ? id + "-key-error" : undefined
          }
        />
      </label>
      {errors.idempotencyKey && (
        <p id={id + "-key-error"} className="text-[13px] my-3 [[data-ui~='event-publish-form']_>_&]:-mt-1 [[data-ui~='event-publish-form']_>_&]:mb-4.5 text-danger" role="alert">
          {errors.idempotencyKey}
        </p>
      )}
      {blockedReason && (
        <p data-ui="notice" className="rounded-lg bg-warning-subtle text-warning text-[13px] leading-[1.7] my-4 py-3.5 px-4.25 border border-solid border-border" role="status">
          {blockedReason}
        </p>
      )}
      {state.status === "error" && (
        <div className="rounded-[7px] bg-danger-subtle text-danger p-4 my-5 [&_p+p]:pt-2 [&_p]:text-inherit [&_p]:m-0" role="alert">
          <p>{state.message}</p>
          <p>
            Retry keeps the same payload and key to prevent duplicate events. If
            you start a new event, first check Events for an accepted request.
          </p>
        </div>
      )}
      {state.status === "accepted" && (
        <div data-ui="event-publish-result" className="rounded-[7px] bg-accent-subtle p-4 my-5 [&_h3]:text-[14px] [&_p]:mt-1.5 [&_p]:mb-3 [&_p]:text-foreground" role="status">
          <h3>Event accepted</h3>
          <p>
            {state.receipt.delivery_count === 0
              ? "No enabled, subscribed endpoints matched. This event will not be delivered."
              : state.receipt.delivery_count +
              (state.receipt.delivery_count === 1
                ? " delivery created. View deliveries for the outcome."
                : " deliveries created. View deliveries for their outcomes.")}
          </p>
          <div data-ui="form-actions" className="flex items-center flex-wrap in-data-[ui~='confirmation-dialog']:mt-6 in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6 in-data-[ui~='data-table']:gap-3.5 mt-3 gap-4">
            <Link
              className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='notice']:[font-size:inherit] in-data-[ui~='notice']:underline in-data-[ui~='notice']:underline-offset-[3px] in-data-[ui~='notice']:ml-1.25 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='activity-filters']:min-h-9.5 in-data-[ui~='activity-filters']:text-[13px] in-data-[ui~='data-table']:text-[12px] in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='project-overview']:text-[12px] text-[12px] text-accent in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
              href={href + "/events/" + state.receipt.id}
            >
              View event <ArrowRightIcon size={14} aria-hidden="true" />
            </Link>
            <Link
              className="inline-flex items-center font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='notice']:[font-size:inherit] in-data-[ui~='notice']:underline in-data-[ui~='notice']:underline-offset-[3px] in-data-[ui~='notice']:ml-1.25 in-data-[ui~='onboarding-header']:min-h-11 in-data-[ui~='onboarding-header']:text-muted in-data-[ui~='onboarding-header']:text-[13px] in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent in-data-[ui~='activity-filters']:min-h-9.5 in-data-[ui~='activity-filters']:text-[13px] in-data-[ui~='data-table']:text-[12px] in-data-[ui~='workspace-banner']:[font-size:inherit] in-data-[ui~='workspace-banner']:underline in-data-[ui~='project-overview']:text-[12px] text-[12px] text-accent in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[12px]"
              href={
                href +
                "/deliveries?event_id=" +
                encodeURIComponent(state.receipt.id)
              }
            >
              View deliveries
            </Link>
          </div>
        </div>
      )}
      <div data-ui="form-actions" className="flex items-center flex-wrap gap-2.5 in-data-[ui~='confirmation-dialog']:mt-6 in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6 in-data-[ui~='data-table']:gap-3.5 in-data-[ui~='event-publish-result']:mt-3 in-data-[ui~='event-publish-result']:gap-4 [[data-ui~='event-publish-form']_>_&]:mt-5">
        {state.status !== "accepted" && (
          <Button
            type="submit"
            data-ui="button"
            disabled={busy || Boolean(blockedReason)}
          >
            {busy
              ? "Publishing…"
              : state.status === "error"
                ? "Retry same request"
                : "Publish event"}
          </Button>
        )}
        {(state.status === "accepted" || state.status === "error") && (
          <Button
            type="button"
            data-ui="button" variant="secondary"
            onClick={newEvent}
          >
            New event
          </Button>
        )}
        {onClose && (
          <Button
            type="button"
            data-ui="button" variant="quiet"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </Button>
        )}
      </div>
      {!locked && (
        <p className="text-[12px] text-muted leading-[1.7] [[data-ui~='event-publish-form']_>_&]:mt-3 [[data-ui~='event-publish-form']_>_&]:mb-0">
          Publishes to all enabled endpoints subscribed to this event type.
        </p>
      )}
    </form>
  );
}
