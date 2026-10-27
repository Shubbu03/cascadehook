"use client";

import { XIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { PublishEventForm } from "./publish-event-form";

export function PublishEventDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirmation-dialog event-publish-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="event-publish-heading">
        <h2 id={id}>Publish event</h2>
        <button
          type="button"
          className="button button-small button-quiet"
          aria-label="Close publisher"
          disabled={pending}
          onClick={onClose}
        >
          <XIcon size={18} aria-hidden="true" />
        </button>
      </div>
      <PublishEventForm onClose={onClose} onPendingChange={setPending} />
    </dialog>
  );
}
