"use client";

import { useId, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";

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

  function submit(event: FormEvent<HTMLFormElement>) {
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
    <form className="setup-form" onSubmit={submit} aria-busy={pending}>
      <h2 id={titleId}>
        {kind === "organization" ? "Create organization" : "Create project"}
      </h2>
      <label className="form-field" htmlFor={id}>
        <span>
          {kind === "organization" ? "Organization name" : "Project name"}
        </span>
        <input
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
        <p className="form-error" id={id + "-error"} role="alert">
          {message}
        </p>
      )}
      <div className="form-actions">
        <button
          type="submit"
          className="button button-primary"
          disabled={pending}
        >
          {pending ? "Creating…" : "Create " + kind}
        </button>
        {onCancel && (
          <button
            type="button"
            className="button button-quiet"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
