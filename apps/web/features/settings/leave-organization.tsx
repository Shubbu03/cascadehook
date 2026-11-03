"use client";

import { Button } from "@/components/button";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { Organization } from "@/features/workspace/types";
import { useSessionUserId } from "@/features/workspace/session";
import { deletionToken } from "./deletion";
import { leaveOrganization } from "./membership-actions";

export function LeaveOrganization({
  organization,
}: {
  organization: Organization;
}) {
  const { sessionId } = useAuth();
  const clerk = useClerk();
  const userId = useSessionUserId();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const leave = useMutation({
    retry: false,
    mutationFn: () =>
      leaveOrganization(
        organization.id,
        deletionToken(clerk.session, sessionId, userId),
      ),
    onSuccess: async () => {
      await client.cancelQueries();
      client.clear();
      if (clerk.user?.id === userId) window.location.replace("/dashboard");
    },
    onError: () => setConfirming(false),
  });
  return (
    <section data-ui="danger-zone-action" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-center gap-y-5 gap-x-9 p-6 [[data-ui~='danger-zone-action']+&]:border-t [[data-ui~='danger-zone-action']+&]:[border-top-style:solid] [[data-ui~='danger-zone-action']+&]:border-t-border [&_>_:is([data-ui~='deletion-form'],[data-ui~='button'])]:[justify-self:end]">
      <div className="[&_>_p]:max-w-145 [&_>_p]:mb-0 [&_>_p]:text-muted [&_>_p]:text-[13px] [&_>_p]:leading-[1.8] [&_>_h2]:mb-4 [&_>_h2]:text-[19px] [&_>_p+p]:mt-2 [[data-ui~='danger-zone']_>_&]:mb-5 [&_>_:is(h2,h3)]:mb-2 [&_>_:is(h2,h3)]:text-[16px]">
        <h3>Leave organization</h3>
        <p>You will lose access to all projects in {organization.name}.</p>
        {organization.role === "owner" && (
          <p>
            Another owner must remain. Promote a teammate before leaving if you
            are the only owner.
          </p>
        )}
      </div>
      <Button
        type="button"
        data-ui="button" variant="secondary" className="text-danger"
        disabled={leave.isPending}
        onClick={() => {
          leave.reset();
          setConfirming(true);
        }}
      >
        Leave organization
      </Button>
      {leave.isError && (
        <p className="text-danger text-[13px] my-3 [[data-ui~='danger-zone-action']_>_&]:col-span-full [[data-ui~='danger-zone-action']_>_&]:m-0" role="alert">
          {leave.error.message}{" "}
          <a href="/dashboard" className="inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='switcher-error']:mt-1.25 in-data-[ui~='switcher-error']:text-[13px] in-data-[ui~='switcher-error']:text-accent [[data-ui~='settings-section']_>_&]:text-[14px] in-data-[ui~='notification-error']:ml-auto in-data-[ui~='notification-error']:text-[12px] [[data-ui~='organization-settings']_>_&:first-child]:mb-4.5 [[data-ui~='organization-settings']_>_&:first-child]:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px]">
            Return to Projects
          </a>
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title={"Leave " + organization.name + "?"}
          confirmLabel="Leave"
          pendingLabel="Leaving…"
          destructive
          pending={leave.isPending}
          onConfirm={() => leave.mutate()}
          onCancel={() => setConfirming(false)}
        >
          <p>
            You will need a new invitation to rejoin. The organization and its
            projects will remain.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
