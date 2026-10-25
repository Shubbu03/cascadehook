"use client";

import { useMutation } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ApiError } from "@/lib/api";

export function DeleteAction({
  title,
  description,
  confirmationText,
  onDelete,
  onDeleted,
}: {
  title: string;
  description: string;
  confirmationText: string;
  onDelete: (confirmation: string) => Promise<void>;
  onDeleted: () => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    retry: false,
    mutationFn: async () => {
      if (typed !== confirmationText)
        throw new Error("The confirmation does not match.");
      await onDelete(typed);
    },
    onSuccess: () => {
      setConfirming(false);
      onDeleted();
    },
    onError: () => setConfirming(false),
  });
  const uncertain =
    remove.error instanceof ApiError &&
    (remove.error.status === 0 || remove.error.status >= 500);
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typed !== confirmationText || remove.isPending) return;
    remove.reset();
    setConfirming(true);
  }
  return (
    <section className="settings-section danger-zone">
      <h2>{title}</h2>
      <p id={id + "-description"}>{description}</p>
      <form
        className="deletion-form"
        onSubmit={review}
        aria-busy={remove.isPending}
      >
        <label className="form-field">
          <span>
            Type <code>{confirmationText}</code> to confirm
          </span>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={remove.isPending}
            required
            autoComplete="off"
            spellCheck={false}
            aria-describedby={id + "-description"}
          />
        </label>
        <button
          type="submit"
          className="button button-secondary text-danger"
          disabled={typed !== confirmationText || remove.isPending}
        >
          {title}
        </button>
      </form>
      {remove.isError && (
        <p className="form-error" role="alert">
          {remove.error.message}
          {uncertain &&
            " The request may have been accepted. Refresh or retry the same deletion to confirm."}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title={title + "?"}
          confirmLabel="Request permanent deletion"
          pendingLabel="Requesting…"
          destructive
          pending={remove.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            if (typed === confirmationText && !remove.isPending)
              remove.mutate();
          }}
        >
          <p>{description}</p>
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
