"use client";

import { XIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { EndpointForm } from "./endpoint-form";

export function EndpointRegistrationDialog({
  onClose,
  onRegistered = onClose,
}: {
  onClose: () => void;
  onRegistered?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirmation-dialog endpoint-registration-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="endpoint-dialog-heading">
        <h2 id={id}>Register endpoint</h2>
        <button
          type="button"
          className="button button-small button-quiet"
          aria-label="Close registration"
          disabled={pending}
          onClick={onClose}
        >
          <XIcon size={18} aria-hidden="true" />
        </button>
      </div>
      <EndpointForm
        onCancel={onClose}
        onPendingChange={setPending}
        onRegistered={onRegistered}
      />
    </dialog>
  );
}
