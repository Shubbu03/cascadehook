"use client";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

import { useAuth } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { useId, useState, type SubmitEvent } from "react";
import { ApiError, apiRequest } from "@/lib/api";
import { notify } from "@/lib/notify";

export function RenameForm({
  kind,
  name,
  path,
  saved,
}: {
  kind: string;
  name: string;
  path: string;
  saved: () => Promise<unknown>;
}) {
  const { getToken } = useAuth();
  const id = useId();
  const [validation, setValidation] = useState("");
  const rename = useMutation({
    mutationFn: (name: string) =>
      apiRequest<unknown>(path, getToken, { method: "PATCH", data: { name } }),
    onSuccess: () => notify("Name updated.", "success"),
    onSettled: saved,
  });
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(
      new FormData(event.currentTarget).get("name") ?? "",
    ).trim();
    if (!value || [...value].length > 100 || /\p{Cc}/u.test(value)) {
      setValidation(
        "Enter a name with 1–100 characters and no control characters.",
      );
      return;
    }
    setValidation("");
    rename.mutate(value);
  }
  const message = validation || rename.error?.message;
  const invalidName =
    Boolean(validation) ||
    (rename.error instanceof ApiError &&
      (rename.error.code === "invalid_name" ||
        rename.error.code === "project_name_exists"));

  return (
    <form
      data-ui="settings-form" className="max-w-125 rounded-[9px] bg-surface p-5.5 my-6 border border-solid border-border in-data-[ui~='dashboard-main']:max-w-140 in-data-[ui~='dashboard-main']:rounded-none in-data-[ui~='dashboard-main']:bg-transparent in-data-[ui~='dashboard-main']:p-0 in-data-[ui~='dashboard-main']:my-6 in-data-[ui~='dashboard-main']:border-0 in-data-[ui~='dashboard-main']:border-none in-data-[ui~='dashboard-main']:border-current"
      onSubmit={submit}
      aria-busy={rename.isPending}
    >
      <div data-ui="rename-row" className="flex items-end gap-3">
        <label data-ui="form-field" className="grid gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium in-data-[ui~='danger-zone']:max-w-115 flex-1 min-w-0 mb-0">
          <span>{kind} name</span>
          <Input className="[[data-ui~='workspace-create-dialog']_&]:bg-surface-hover [[data-ui~='workspace-create-dialog']_&]:border-0 [[data-ui~='workspace-create-dialog']_&]:border-none [[data-ui~='workspace-create-dialog']_&]:border-current [[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 [[data-ui~='workspace-create-dialog']_&]:focus-visible:outline-hidden [[data-ui~='workspace-create-dialog']_&]:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted"
            id={id}
            name="name"
            defaultValue={name}
            required
            disabled={rename.isPending}
            aria-invalid={invalidName}
            aria-describedby={message ? id + "-error" : undefined}
          />
        </label>
        <Button
          type="submit"
          data-ui="button" size="small" className="leading-[1.4] shrink-0 min-h-10 whitespace-nowrap"
          disabled={rename.isPending}
        >
          {rename.isPending ? "Saving…" : "Save name"}
        </Button>
      </div>
      {message && (
        <p id={id + "-error"} role="alert" className="text-danger text-[13px] my-3 mb-4">
          {message}
        </p>
      )}
    </form>
  );
}
