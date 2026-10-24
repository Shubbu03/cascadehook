"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import {
  endpointKeys,
  endpointPath,
  eventTypePattern,
  type Endpoint,
  type EndpointInput,
} from "./types";

export function EndpointForm({
  endpoint,
  onSaved,
  onCancel,
}: {
  endpoint?: Endpoint;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const { project, canManage, suspended, availabilityKnown } = useProject();
  const { getToken } = useAuth();
  const userId = useSessionUserId();
  const queryClient = useQueryClient();
  const router = useRouter();
  const id = useId();
  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [types, setTypes] = useState(endpoint?.event_types.join("\n") ?? "");
  const [errors, setErrors] = useState<{ url?: string; eventTypes?: string }>(
    {},
  );
  const href = projectHref(project.id) + "/endpoints";
  const save = useMutation({
    mutationFn: (input: EndpointInput) =>
      apiRequest<Endpoint>(endpointPath(project.id, endpoint?.id), getToken, {
        method: endpoint ? "PATCH" : "POST",
        data: input,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(
        endpointKeys.detail(userId, project.id, saved.id),
        saved,
      );
      notify(
        endpoint
          ? "Endpoint updated."
          : "Endpoint registered. Set up its signing secret next.",
        "success",
      );
      if (endpoint) onSaved?.();
      else router.replace(href + "/" + encodeURIComponent(saved.id));
    },
    onError: (error) => notify(error.message, "error"),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: endpointKeys.lists(userId, project.id),
      });
      if (endpoint)
        void queryClient.invalidateQueries({
          queryKey: endpointKeys.detail(userId, project.id, endpoint.id),
        });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    const value = url.trim();
    const next: typeof errors = {};
    try {
      const parsed = new URL(value);
      if (
        parsed.protocol !== "https:" ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password ||
        value.includes("#") ||
        new TextEncoder().encode(value).length > 2048
      )
        next.url =
          "Use a public HTTPS URL without credentials or a fragment, up to 2,048 bytes.";
    } catch {
      next.url = "Enter a valid HTTPS destination URL.";
    }
    const eventTypes = types
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (
      !eventTypes.length ||
      eventTypes.length > 100 ||
      eventTypes.some((item) => !eventTypePattern.test(item))
    ) {
      next.eventTypes =
        "Enter 1–100 event types, each 3–128 characters, using lowercase letters, numbers, dots, underscores, or hyphens.";
    } else if (new Set(eventTypes).size !== eventTypes.length)
      next.eventTypes = "Remove duplicate event types.";
    setErrors(next);
    if (!Object.keys(next).length)
      save.mutate({ url: value, event_types: eventTypes });
  }

  if (!canManage || (!endpoint && (suspended || !availabilityKnown)))
    return (
      <div className="empty-state">
        <h3>
          {canManage
            ? "Endpoint registration is unavailable."
            : "Read-only access"}
        </h3>
        <p>
          {canManage
            ? "Project availability must be confirmed and the project active before adding an endpoint."
            : "An owner or admin can register and edit endpoints."}
        </p>
        <Link href={href} className="text-link">
          Back to endpoints
        </Link>
      </div>
    );

  return (
    <form
      className="setup-form endpoint-form"
      onSubmit={submit}
      aria-busy={save.isPending}
    >
      <div className="form-field">
        <label htmlFor={id + "-url"}>Destination URL</label>
        <input
          id={id + "-url"}
          type="url"
          name="url"
          placeholder="https://your-app.com/webhooks"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={save.isPending}
          required
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(errors.url)}
          aria-describedby={id + "-url-help"}
        />
        <p
          id={id + "-url-help"}
          className={errors.url ? "form-error" : "field-help"}
        >
          {errors.url ??
            "Use a public HTTPS receiver. Private addresses and redirects aren't supported."}
        </p>
      </div>
      <div className="form-field">
        <label htmlFor={id + "-types"}>Event subscriptions</label>
        <textarea
          id={id + "-types"}
          name="event_types"
          value={types}
          onChange={(event) => setTypes(event.target.value)}
          placeholder={"invoice.paid\nsubscription.updated"}
          rows={5}
          required
          disabled={save.isPending}
          spellCheck={false}
          aria-invalid={Boolean(errors.eventTypes)}
          aria-describedby={id + "-types-help"}
        />
        <p
          id={id + "-types-help"}
          className={errors.eventTypes ? "form-error" : "field-help"}
        >
          {errors.eventTypes ??
            "One event type per line, or separate them with commas. Exact matches only; wildcards aren't supported."}
        </p>
      </div>
      {endpoint && url.trim() !== endpoint.url && (
        <p className="notice notice-warning">
          Changing the destination URL clears verification and disables
          delivery. Verify the new receiver before enabling it again.
        </p>
      )}
      {!endpoint && (
        <p className="field-help endpoint-form-note">
          Registration saves the destination and subscriptions. It sends no
          request and leaves delivery disabled until you complete setup.
        </p>
      )}
      {save.error && (
        <p className="form-error" role="alert">
          {save.error.message}
        </p>
      )}
      <div className="form-actions">
        <button
          type="submit"
          className="button button-primary"
          disabled={save.isPending}
        >
          {save.isPending
            ? "Saving…"
            : endpoint
              ? "Save changes"
              : "Register endpoint"}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="button button-quiet"
            disabled={save.isPending}
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : (
          <Link href={href} className="button button-quiet">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
