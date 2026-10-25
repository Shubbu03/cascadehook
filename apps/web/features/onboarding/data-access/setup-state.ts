import type { Account, Organization, Page } from "@/features/workspace/types";
import { ApiError } from "@/lib/api";

export type SetupState =
  | { step: "organization" }
  | { step: "project"; organization: Organization }
  | { step: "ready" };

type SetupRequest = <T>(
  path: string,
  params?: Record<string, string | number>,
) => Promise<T>;

export async function resolveSetup(request: SetupRequest): Promise<SetupState> {
  const account = await request<Account>("/v1/me");
  if (account.onboarding_completed_at === undefined) {
    throw new ApiError(
      "Workspace setup is unavailable. Update and restart the API after applying the latest database migrations.",
      503,
      "workspace_setup_version_mismatch",
    );
  }
  if (account.onboarding_completed_at) return { step: "ready" };
  let organization: Organization | undefined;
  let cursor: string | null = null;

  do {
    const page: Page<Organization> = await request("/v1/organizations", {
      limit: 20,
      ...(cursor ? { cursor } : {}),
    });
    organization ??= page.data.find((item) => item.role !== "member");
    cursor = page.next_cursor;
  } while (cursor);

  return organization
    ? { step: "project", organization }
    : { step: "organization" };
}

export function setupPath(state: SetupState) {
  return state.step === "ready" ? "/dashboard" : "/onboarding/" + state.step;
}
