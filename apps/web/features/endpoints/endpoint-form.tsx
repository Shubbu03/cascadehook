"use client";

import { Button } from "@/components/button";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState, type SubmitEvent } from "react";
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
import { queryKeys } from "@/lib/query-keys";

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
        queryKey: queryKeys.projectUsage(userId, project.id),
      });
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
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
      data-ui="endpoint-form" className="max-w-190"
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
      <p className="text-[12px] text-muted leading-[1.7] mb-5 in-data-[ui~='endpoint-registration-dialog']:text-muted in-data-[ui~='endpoint-registration-dialog']:text-[12px] in-data-[ui~='endpoint-registration-dialog']:leading-[1.7]">
        Delivery starts disabled. After registering, configure your signing
        secret and verify the receiver.
      </p>
      {!allowed && (
        <p className="rounded-lg bg-warning-subtle text-warning text-[13px] leading-[1.7] my-4 py-3.5 px-4.25 border border-solid border-border in-data-[ui~='endpoint-registration-dialog']:text-warning" role="status">
          {!canManage
            ? "Only an owner or admin can register endpoints."
            : suspended
              ? "Registration is unavailable while this project is paused."
              : "Check project availability before registering an endpoint."}
        </p>
      )}
      {save.error && (
        <p className="text-danger text-[13px] my-0 [[data-ui~='endpoint-form']_>_&]:my-4 in-data-[ui~='endpoint-registration-dialog']:text-danger" role="alert">{save.error.message}</p>
      )}
      <div data-ui="form-actions" className="flex items-center flex-wrap gap-2.5 in-data-[ui~='confirmation-dialog']:mt-6 in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6">
        <Button
          type="submit"
          data-ui="button"
          disabled={save.isPending || !allowed}
        >
          {save.isPending ? "Registering…" : "Register endpoint"}
        </Button>
        <Button
          type="button"
          data-ui="button" variant="quiet"
          disabled={save.isPending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
