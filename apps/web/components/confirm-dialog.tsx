"use client";

import { useId } from "react";
import { Modal } from "./modal";

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pending = false,
  pendingLabel = "Updating…",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  pending?: boolean;
  pendingLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  return (
    <Modal
      className="confirmation-dialog"
      aria-labelledby={id}
      aria-describedby={id + "-description"}
      onDismiss={onCancel}
      dismissDisabled={pending}
    >
      <h2 id={id}>{title}</h2>
      <div id={id + "-description"}>{children}</div>
      <div className="form-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          type="button"
          className={
            "button " + (destructive ? "button-danger" : "button-primary")
          }
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
