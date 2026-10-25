"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";
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
            name="name"
            defaultValue={name}
            required
            disabled={rename.isPending}
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
      {(validation || rename.isError) && (
        <p role="alert" className="form-error">
          {validation || rename.error?.message}
        </p>
      )}
    </form>
  );
}
