"use client";

import { Input } from "@/components/input";

import { Button } from "@/components/button";

import { useMutation } from "@tanstack/react-query";
import { useId, useState, type SubmitEvent } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ApiError } from "@/lib/api";

export function DeleteAction({
  title,
  description,
  confirmationText,
  onDelete,
  onDeleted,
  grouped = false,
}: {
  title: string;
  description: string;
  confirmationText: string;
  onDelete: (confirmation: string) => Promise<void>;
  onDeleted: () => void;
  grouped?: boolean;
}) {
  const id = useId();
  const Heading = grouped ? "h3" : "h2";
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
  function review(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typed !== confirmationText || remove.isPending) return;
    remove.reset();
    setConfirming(true);
  }
  return (
    <section
      data-ui={grouped ? "danger-zone-action" : "settings-section danger-zone"} className={(grouped) ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-center gap-y-5 gap-x-9 p-6 [[data-ui~='danger-zone-action']+&]:border-t [[data-ui~='danger-zone-action']+&]:[border-top-style:solid] [[data-ui~='danger-zone-action']+&]:border-t-border [&_>_:is([data-ui~='deletion-form'],[data-ui~='button'])]:[justify-self:end]" : "mt-9 pt-7 border-t [border-top-style:solid] border-t-border [&_>_h3]:text-[19px] [&_>_h3]:mb-4 [&_>_h2]:mb-4 [&_>_h2]:text-[19px] [&_>_p]:max-w-145 [&_>_p]:mb-5 [&_>_p]:text-muted [&_>_p]:text-[13px] [&_>_p]:leading-[1.8] in-data-[ui~='dashboard-main']:mt-7.5 in-data-[ui~='dashboard-main']:pt-6 in-data-[ui~='dashboard-main']:max-w-190 [[data-ui~='dashboard-main']_&_>_h3]:text-[17px]"}
    >
      <div className="[&_>_p]:max-w-145 [&_>_p]:mb-0 [&_>_p]:text-muted [&_>_p]:text-[13px] [&_>_p]:leading-[1.8] [&_>_h2]:mb-4 [&_>_h2]:text-[19px] [&_>_p+p]:mt-2 [[data-ui~='danger-zone']_>_&]:mb-5 [&_>_:is(h2,h3)]:mb-2 [&_>_:is(h2,h3)]:text-[16px]">
        <Heading>{title}</Heading>
        <p id={id + "-description"}>{description}</p>
      </div>
      <form
        data-ui="deletion-form" className="flex items-end flex-wrap max-w-190 gap-3 [[data-ui~='danger-zone-action']_>_&]:w-full"
        onSubmit={review}
        aria-busy={remove.isPending}
      >
        <label data-ui="form-field" className="grid gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium flex-[1_1_220px] min-w-0 max-w-none mb-0 in-data-[ui~='danger-zone']:max-w-115 [[data-ui~='organization-danger-zone']_[data-ui~='deletion-form']_&]:max-w-none">
          <span>
            Type <code>{confirmationText}</code> to confirm
          </span>
          <Input className="[[data-ui~='workspace-create-dialog']_&]:bg-surface-hover [[data-ui~='workspace-create-dialog']_&]:border-0 [[data-ui~='workspace-create-dialog']_&]:border-none [[data-ui~='workspace-create-dialog']_&]:border-current [[data-ui~='dashboard-main']_&]:min-h-10 [[data-ui~='dashboard-main']_&]:text-[14px] [[data-ui~='dashboard-main']_&]:py-2.25 [[data-ui~='dashboard-main']_&]:px-3 [[data-ui~='workspace-create-dialog']_&]:focus-visible:outline-hidden [[data-ui~='workspace-create-dialog']_&]:focus-visible:shadow-[inset_0_-2px_var(--accent)] max-[37.5rem]:[[data-ui~='dashboard-main']_&]:text-[16px] w-full min-h-11.5 rounded-md text-foreground text-[16px] py-2.75 px-3 placeholder:text-muted"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={remove.isPending}
            required
            autoComplete="off"
            spellCheck={false}
            aria-describedby={id + "-description"}
          />
        </label>
        <Button
          type="submit"
          data-ui="button" variant="secondary" className="text-danger"
          disabled={typed !== confirmationText || remove.isPending}
        >
          {title}
        </Button>
      </form>
      {remove.isError && (
        <p className="text-danger text-[13px] my-3 [[data-ui~='danger-zone-action']_>_&]:col-span-full [[data-ui~='danger-zone-action']_>_&]:m-0" role="alert">
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
