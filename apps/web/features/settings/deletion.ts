import type { Organization, Page } from "@/features/workspace/types";
import { apiRequest, ApiError } from "@/lib/api";
import { uuidPattern } from "@/lib/format";

type GetToken = () => Promise<string | null>;

export function deletionToken(
  session:
    | { id: string; user: { id: string }; getToken: GetToken }
    | null
    | undefined,
  expectedSessionId: string | null | undefined,
  expectedUserId: string,
): GetToken {
  if (
    !session ||
    session.id !== expectedSessionId ||
    session.user.id !== expectedUserId
  ) {
    throw new Error(
      "Your signed-in account changed. Reload before confirming deletion.",
    );
  }
  // Keep this operation bound to the confirmed session even if the active account changes.
  return () => session.getToken();
}

function confirmReceipt(
  value: unknown,
  field: "organization_id" | "user_id",
  id: string,
) {
  const receipt =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  if (
    !receipt ||
    receipt[field] !== id ||
    typeof receipt.deletion_requested_at !== "string" ||
    !Number.isFinite(Date.parse(receipt.deletion_requested_at))
  ) {
    throw new Error(
      "The deletion response could not be confirmed. The request may have been accepted; refresh before retrying.",
    );
  }
}

export async function requestOrganizationDeletion(
  organization: Organization,
  confirmation: string,
  getToken: GetToken,
) {
  if (organization.role !== "owner")
    throw new ApiError("Only an owner can delete this organization.", 403);
  if (!uuidPattern.test(organization.id) || confirmation !== organization.name)
    throw new Error("Type the exact organization name to confirm.");
  const receipt = await apiRequest<unknown>(
    "/v1/organizations/" + encodeURIComponent(organization.id),
    getToken,
    { method: "DELETE" },
  );
  confirmReceipt(receipt, "organization_id", organization.id);
}

export async function requestAccountDeletion(
  accountId: string,
  confirmation: string,
  getToken: GetToken,
) {
  if (!uuidPattern.test(accountId) || confirmation !== "DELETE")
    throw new Error("Type DELETE to confirm account deletion.");
  const receipt = await apiRequest<unknown>("/v1/me", getToken, {
    method: "DELETE",
  });
  confirmReceipt(receipt, "user_id", accountId);
}

export async function ownedOrganizations(
  getToken: GetToken,
  signal: AbortSignal,
) {
  const owners: Organization[] = [];
  let cursor: string | null = null;
  do {
    const page: Page<Organization> = await apiRequest(
      "/v1/organizations",
      getToken,
      { signal, params: { limit: 20, ...(cursor ? { cursor } : {}) } },
    );
    owners.push(
      ...page.data.filter((organization) => organization.role === "owner"),
    );
    cursor = page.next_cursor;
  } while (cursor);
  return owners;
}
