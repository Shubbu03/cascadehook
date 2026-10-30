"use client";

import { XIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Modal } from "@/components/modal";
import { EndpointForm } from "./endpoint-form";

export function EndpointRegistrationDialog({
  onClose,
  onRegistered = onClose,
}: {
  onClose: () => void;
  onRegistered?: () => void;
}) {
  const id = useId();
  const [pending, setPending] = useState(false);

  return (
    <Modal
      className="confirmation-dialog endpoint-registration-dialog"
      aria-labelledby={id}
      onDismiss={onClose}
      dismissDisabled={pending}
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
    </Modal>
  );
}
