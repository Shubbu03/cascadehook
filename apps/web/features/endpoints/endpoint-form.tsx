"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useProject, projectHref } from "@/features/projects/project-workspace";
import { useSessionUserId } from "@/features/workspace/session";
import { apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";
import {
  EndpointDestinationField,
  EndpointSubscriptionsField,
} from "./endpoint-fields";
import { validateEndpointDraft, type EndpointErrors } from "./endpoint-input";
import {
  endpointKeys,
  endpointPath,
  type Endpoint,
  type EndpointInput,
} from "./types";

export function EndpointForm({
  onCancel,
  onPendingChange,
  onRegistered,
}: {
  onCancel: () => void;
  onPendingChange: (pending: boolean) => void;
  onRegistered: () => void;
}) {
  const { project, canManage, suspended, availabilityKnown } = useProject();
  const { getToken } = useAuth();
  const userId = useSessionUserId();
  const queryClient = useQueryClient();
  const router = useRouter();
  const id = useId();
  const [url, setUrl] = useState("");
  const [types, setTypes] = useState("");
  const [errors, setErrors] = useState<EndpointErrors>({});
  const allowed = canManage && availabilityKnown && !suspended;
  const save = useMutation({
    mutationFn: (input: EndpointInput) =>
      apiRequest<Endpoint>(endpointPath(project.id), getToken, {
        method: "POST",
        data: input,
      }),
    onMutate: () => onPendingChange(true),
    onSuccess: (saved) => {
      queryClient.setQueryData(
        endpointKeys.detail(userId, project.id, saved.id),
        saved,
      );
      notify("Endpoint registered. Set up its signing secret next.", "success");
      onRegistered();
      router.push(
        projectHref(project.id) + "/endpoints/" + encodeURIComponent(saved.id),
      );
    },
    onError: (error) => notify(error.message, "error"),
    onSettled: () => {
      onPendingChange(false);
      void queryClient.invalidateQueries({
        queryKey: endpointKeys.lists(userId, project.id),
      });
      void queryClient.invalidateQueries({
        queryKey: ["usage", userId, "project", project.id],
      });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending || !allowed) return;
    const result = validateEndpointDraft({ url, eventTypes: types });
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(result.input);
  }

  return (
    <form
      className="endpoint-form"
      onSubmit={submit}
      aria-busy={save.isPending}
      noValidate
    >
      <EndpointDestinationField
        id={id + "-url"}
        value={url}
        onChange={setUrl}
        error={errors.url}
        disabled={save.isPending || !allowed}
      />
      <EndpointSubscriptionsField
        id={id + "-types"}
        value={types}
        onChange={setTypes}
        error={errors.eventTypes}
        disabled={save.isPending || !allowed}
      />
      <p className="field-help endpoint-form-note">
        Delivery starts disabled. After registering, configure your signing
        secret and verify the receiver.
      </p>
      {!allowed && (
        <p className="notice notice-warning" role="status">
          {!canManage
            ? "Only an owner or admin can register endpoints."
            : suspended
              ? "Registration is unavailable while this project is paused."
              : "Check project availability before registering an endpoint."}
        </p>
      )}
      {save.error && (
        <p className="form-error" role="alert">{save.error.message}</p>
      )}
      <div className="form-actions">
        <button
          type="submit"
          className="button button-primary"
          disabled={save.isPending || !allowed}
        >
          {save.isPending ? "Registering…" : "Register endpoint"}
        </button>
        <button
          type="button"
          className="button button-quiet"
          disabled={save.isPending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
