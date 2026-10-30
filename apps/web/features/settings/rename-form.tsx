"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
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
  function submit(event: FormEvent<HTMLFormElement>) {
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
      className="settings-form"
      onSubmit={submit}
      aria-busy={rename.isPending}
    >
      <div className="rename-row">
        <label className="form-field">
          <span>{kind} name</span>
          <input
            id={id}
            name="name"
            defaultValue={name}
            required
            disabled={rename.isPending}
            aria-invalid={invalidName}
            aria-describedby={message ? id + "-error" : undefined}
          />
        </label>
        <button
          type="submit"
          className="button button-small button-primary"
          disabled={rename.isPending}
        >
          {rename.isPending ? "Saving…" : "Save name"}
        </button>
      </div>
      {message && (
        <p id={id + "-error"} role="alert" className="form-error">
          {message}
        </p>
      )}
    </form>
  );
}
