import type {
  Account,
  Organization,
  Page,
  Project,
} from "@/features/workspace/types";

export type SetupState =
  | { step: "organization" }
  | { step: "project"; organization: Organization }
  | { step: "ready" };

type SetupRequest = <T>(
  path: string,
  params?: Record<string, string | number>,
) => Promise<T>;

export async function resolveSetup(request: SetupRequest): Promise<SetupState> {
  await request<Account>("/v1/me");
  let organization: Organization | undefined;
  let cursor: string | null = null;

  do {
    const page: Page<Organization> = await request("/v1/organizations", {
      limit: 20,
      ...(cursor ? { cursor } : {}),
    });
    const projects = await Promise.all(
      page.data.map((item) =>
        request<Page<Project>>(
          "/v1/organizations/" + encodeURIComponent(item.id) + "/projects",
          { limit: 1 },
        ),
      ),
    );
    if (projects.some((page) => page.data.length > 0)) return { step: "ready" };

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
