"use client";

import { Button } from "@/components/button";

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
      data-ui="confirmation-dialog" className="w-[min(460px,calc(100%-40px))] max-h-[calc(100svh-48px)] rounded-xl bg-surface text-foreground shadow-floating overflow-y-auto m-auto p-7 border border-solid border-border [&_h2]:text-[22px] [&_h2]:tracking-[-0.03em] [&_p]:mt-4 [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.8] backdrop:bg-[#0008] max-[32.5rem]:p-5.75"
      aria-labelledby={id}
      aria-describedby={id + "-description"}
      onDismiss={onCancel}
    >
      <h2 id={id}>{title}</h2>
      <div id={id + "-description"}>{children}</div>
      <div data-ui="form-actions" className="flex items-center flex-wrap gap-2.5 mt-6 in-data-[ui~='endpoint-security-card']:gap-1.5 in-data-[ui~='workspace-create-dialog']:flex-row-reverse in-data-[ui~='workspace-create-dialog']:mt-6">
        <Button
          type="button"
          data-ui="button" variant="secondary"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant={destructive ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
