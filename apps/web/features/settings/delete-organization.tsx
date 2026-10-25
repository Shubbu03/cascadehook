"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import type { Organization } from "@/features/workspace/types";
import { useSessionUserId } from "@/features/workspace/session";
import { DeleteAction } from "./delete-action";
import { deletionToken, requestOrganizationDeletion } from "./deletion";

export function DeleteOrganization({
  organization,
  returnTo,
}: {
  organization: Organization;
  returnTo: "/dashboard" | "/account";
}) {
  const { sessionId } = useAuth();
  const clerk = useClerk();
  const userId = useSessionUserId();
  const client = useQueryClient();
  if (organization.role !== "owner") return null;
  return (
    <DeleteAction
      grouped
      title="Delete organization"
      confirmationText={organization.name}
      description="Permanently removes this organization, its projects, credentials, endpoints, and retained history. Activity stops when the request is accepted; cleanup runs in the background."
      onDelete={(confirmation) =>
        requestOrganizationDeletion(
          organization,
          confirmation,
          deletionToken(clerk.session, sessionId, userId),
        )
      }
      onDeleted={() => {
        client.clear();
        if (clerk.user?.id === userId) window.location.replace(returnTo);
      }}
    />
  );
}
