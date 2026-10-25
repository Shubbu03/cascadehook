import type { Account } from "@/features/workspace/types";
import { apiRequest } from "@/lib/api";
import { uuidPattern } from "@/lib/format";

export async function leaveOrganization(
  organizationId: string,
  getToken: () => Promise<string | null>,
) {
  if (!uuidPattern.test(organizationId))
    throw new Error("Invalid organization.");
  const account = await apiRequest<Account>("/v1/me", getToken);
  if (!uuidPattern.test(account.id))
    throw new Error(
      "Your account could not be confirmed. Reload before leaving.",
    );
  await apiRequest<void>(
    "/v1/organizations/" +
      encodeURIComponent(organizationId) +
      "/members/" +
      encodeURIComponent(account.id),
    getToken,
    { method: "DELETE" },
  );
}
