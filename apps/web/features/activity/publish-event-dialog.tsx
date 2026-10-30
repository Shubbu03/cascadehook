"use client";

import { XIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Modal } from "@/components/modal";
import { PublishEventForm } from "./publish-event-form";

export function PublishEventDialog({
  onClose,
  initialType,
  eventTypes,
}: {
  onClose: () => void;
  initialType?: string;
  eventTypes?: string[];
}) {
  const [pending, setPending] = useState(false);
  const id = useId();
  return (
    <Modal
      className="confirmation-dialog event-publish-dialog"
      aria-labelledby={id}
      onDismiss={onClose}
      dismissDisabled={pending}
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
      <PublishEventForm
        initialType={initialType}
        eventTypes={eventTypes}
        onClose={onClose}
        onPendingChange={setPending}
      />
    </Modal>
  );
}
