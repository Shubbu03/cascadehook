"use client";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

import { useId, useState, type SubmitEvent } from "react";
import { ApiError } from "@/lib/api";
import { errorText, formField } from "@/components/styles";

export function NameForm({
  titleId,
  kind,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  titleId?: string;
  kind: "organization" | "project";
  pending: boolean;
  error: Error | null;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [validation, setValidation] = useState<string | null>(null);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || [...trimmed].length > 100 || /\p{Cc}/u.test(trimmed)) {
      setValidation(
        "Enter a name with 1–100 characters and no control characters.",
      );
      return;
    }
    setValidation(null);
    onSubmit(trimmed);
  }

  const message = validation ?? error?.message;
  const invalidName =
    Boolean(validation) ||
    (error instanceof ApiError &&
      (error.code === "invalid_name" || error.code === "project_name_exists"));
  return (
    <form className="rounded-[10px] bg-surface p-6 border border-solid border-border [&_h2]:text-[20px] [&_h2]:tracking-tight [&_h3]:text-[20px] [&_h3]:tracking-tight in-data-[ui~='workspace-create-dialog']:rounded-none in-data-[ui~='workspace-create-dialog']:p-0 in-data-[ui~='workspace-create-dialog']:border-0 in-data-[ui~='workspace-create-dialog']:border-none in-data-[ui~='workspace-create-dialog']:border-current max-[37.5rem]:p-5.5" onSubmit={submit} aria-busy={pending}>
      <h2 id={titleId}>
        {kind === "organization" ? "Create organization" : "Create project"}
      </h2>
      <label className={formField} htmlFor={id}>
        <span>
          {kind === "organization" ? "Organization name" : "Project name"}
        </span>
        <Input className="in-data-[ui~='workspace-create-dialog']:bg-surface-hover in-data-[ui~='workspace-create-dialog']:border-0 in-data-[ui~='workspace-create-dialog']:border-none in-data-[ui~='workspace-create-dialog']:border-current in-data-[ui~='workspace-create-dialog']:focus-visible:outline-hidden in-data-[ui~='workspace-create-dialog']:focus-visible:shadow-[inset_0_-2px_var(--accent)] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted"
          id={id}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={
            kind === "organization" ? "e.g. Acme" : "e.g. Billing service"
          }
          required
          disabled={pending}
          aria-invalid={invalidName}
          aria-describedby={message ? id + "-error" : undefined}
          autoComplete="off"
        />
      </label>
      {message && (
        <p className={errorText} id={id + "-error"} role="alert">
          {message}
        </p>
      )}
      <div data-ui="form-actions" className="flex items-center flex-wrap gap-2.5 in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6">
        <Button
          type="submit"
          data-ui="button"
          disabled={pending}
        >
          {pending ? "Creating…" : "Create " + kind}
        </Button>
        {onCancel && (
          <Button
            type="button"
            data-ui="button" variant="quiet"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
