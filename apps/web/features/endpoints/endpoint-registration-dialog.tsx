"use client";

import { Button } from "@/components/button";

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
      data-ui="confirmation-dialog endpoint-registration-dialog" className="w-[min(600px,calc(100%-32px))] max-h-[calc(100svh-48px)] rounded-xl bg-surface text-foreground shadow-floating overflow-y-auto m-auto p-7 border border-solid border-border [&_h2]:text-[22px] [&_h2]:tracking-[-0.03em] [&_p]:mt-4 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.8] [&_textarea]:min-h-27.5 backdrop:bg-[#0008] max-[32.5rem]:p-5.75"
      aria-labelledby={id}
      onDismiss={onClose}
      dismissDisabled={pending}
    >
      <div data-ui="endpoint-dialog-heading" className="flex items-center justify-between mb-5 gap-4">
        <h2 id={id}>Register endpoint</h2>
        <Button
          type="button"
          data-ui="button" variant="quiet" size="small" className="leading-[1.4] shrink-0 p-2"
          aria-label="Close registration"
          disabled={pending}
          onClick={onClose}
        >
          <XIcon size={18} aria-hidden="true" />
        </Button>
      </div>
      <EndpointForm
        onCancel={onClose}
        onPendingChange={setPending}
        onRegistered={onRegistered}
      />
    </Modal>
  );
}
