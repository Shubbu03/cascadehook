"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
  | { status: "draft" }
  | { status: "pending"; publication: Publication }
  | { status: "error"; publication: Publication; message: string }
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

  async function submit(event: FormEvent<HTMLFormElement>) {
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
      className="event-publish-form"
      onSubmit={submit}
      aria-busy={busy}
      noValidate
    >
      <label className="form-field" htmlFor={id + "-type"}>
        <span>Event type</span>
        <input
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
        <p id={id + "-type-error"} className="form-error" role="alert">
          {errors.type}
        </p>
      )}
      <label className="form-field" htmlFor={id + "-payload"}>
        <span>JSON payload</span>
        <textarea
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
        className={errors.payload ? "form-error" : "field-help"}
        role={errors.payload ? "alert" : undefined}
      >
        {errors.payload ??
          "Sent as the event’s data. Maximum complete event size: 256 KiB."}
      </p>
      <label className="form-field event-publish-key" htmlFor={id + "-key"}>
        <span>
          Idempotency key <span className="workspace-muted">(optional)</span>
        </span>
        <input
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
        <p id={id + "-key-error"} className="form-error" role="alert">
          {errors.idempotencyKey}
        </p>
      )}
      {blockedReason && (
        <p className="notice notice-warning" role="status">
          {blockedReason}
        </p>
      )}
      {state.status === "error" && (
        <div className="event-publish-error" role="alert">
          <p>{state.message}</p>
          <p>
            Retry keeps the same payload and key to prevent duplicate events. If
            you start a new event, first check Events for an accepted request.
          </p>
        </div>
      )}
      {state.status === "accepted" && (
        <div className="event-publish-result" role="status">
          <h3>Event accepted</h3>
          <p>
            {state.receipt.delivery_count === 0
              ? "No enabled, subscribed endpoints matched. This event will not be delivered."
              : state.receipt.delivery_count +
                (state.receipt.delivery_count === 1
                  ? " delivery created. View deliveries for the outcome."
                  : " deliveries created. View deliveries for their outcomes.")}
          </p>
          <div className="form-actions">
            <Link
              className="text-link"
              href={href + "/events/" + state.receipt.id}
            >
              View event <ArrowRightIcon size={14} aria-hidden="true" />
            </Link>
            <Link
              className="text-link"
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
      <div className="form-actions event-publish-actions">
        {state.status !== "accepted" && (
          <button
            type="submit"
            className="button button-primary"
            disabled={busy || Boolean(blockedReason)}
          >
            {busy
              ? "Publishing…"
              : state.status === "error"
                ? "Retry same request"
                : "Publish event"}
          </button>
        )}
        {(state.status === "accepted" || state.status === "error") && (
          <button
            type="button"
            className="button button-secondary"
            onClick={newEvent}
          >
            New event
          </button>
        )}
        {onClose && (
          <button
            type="button"
            className="button button-quiet"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
        )}
      </div>
      {!locked && (
        <p className="field-help event-publish-routing">
          Publishes to all enabled endpoints subscribed to this event type.
        </p>
      )}
    </form>
  );
}
