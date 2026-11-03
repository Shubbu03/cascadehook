"use client";

import { Button } from "@/components/button";

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
      data-ui="confirmation-dialog" className="w-[min(660px,calc(100%-32px))] max-h-[calc(100svh-48px)] rounded-xl bg-surface text-foreground shadow-floating overflow-y-auto m-auto p-7 border border-solid border-border [&_h2]:text-[22px] [&_h2]:tracking-[-0.03em] [&_p]:mt-4 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.8] backdrop:bg-[#0008] max-[32.5rem]:p-5.75"
      aria-labelledby={id}
      onDismiss={onClose}
      dismissDisabled={pending}
    >
      <div data-ui="event-publish-heading" className="flex items-center justify-between mb-6 gap-4">
        <h2 id={id}>Publish event</h2>
        <Button
          type="button"
          data-ui="button" variant="quiet" size="small" className="leading-[1.4] shrink-0 p-2"
          aria-label="Close publisher"
          disabled={pending}
          onClick={onClose}
        >
          <XIcon size={18} aria-hidden="true" />
        </Button>
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
