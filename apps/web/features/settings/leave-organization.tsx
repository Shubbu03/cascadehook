"use client";

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
    <section className="danger-zone-action">
      <div className="danger-zone-copy">
        <h3>Leave organization</h3>
        <p>You will lose access to all projects in {organization.name}.</p>
        {organization.role === "owner" && (
          <p>
            Another owner must remain. Promote a teammate before leaving if you
            are the only owner.
          </p>
        )}
      </div>
      <button
        type="button"
        className="button button-secondary text-danger"
        disabled={leave.isPending}
        onClick={() => {
          leave.reset();
          setConfirming(true);
        }}
      >
        Leave organization
      </button>
      {leave.isError && (
        <p className="form-error" role="alert">
          {leave.error.message}{" "}
          <a href="/dashboard" className="text-link">
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
