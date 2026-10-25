import { describe, expect, test } from "bun:test";
import { resolveSetup, setupPath } from "./setup-state";
import type { Organization } from "@/features/workspace/types";

const organization: Organization = {
  id: "organization",
  name: "Acme",
  role: "owner",
  created_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
};

function accountSetup(completed: boolean, organizations: Organization[]) {
  return <T>(path: string): Promise<T> => {
    if (path === "/v1/me")
      return Promise.resolve({
        id: "account",
        created_at: "2026-10-25T00:00:00Z",
        onboarding_completed_at: completed ? "2026-10-25T01:00:00Z" : null,
      } as T);
    if (path === "/v1/organizations")
      return Promise.resolve({ data: organizations, next_cursor: null } as T);
    if (path === "/v1/organizations/organization/projects")
      return Promise.resolve({ data: [], next_cursor: null } as T);
    throw new Error("Unexpected setup request: " + path);
  };
}

describe("first-time onboarding", () => {
  test("rejects an older API response instead of reopening project creation", async () => {
    const current = accountSetup(false, [organization]);
    const request = <T>(path: string): Promise<T> =>
      path === "/v1/me"
        ? Promise.resolve({
            id: "account",
            created_at: "2026-10-25T00:00:00Z",
          } as T)
        : current<T>(path);
    await expect(resolveSetup(request)).rejects.toThrow(
      "Update and restart the API",
    );
  });

  test("keeps a completed account on All projects after its last project is deleted", async () => {
    const setup = await resolveSetup(accountSetup(true, [organization]));
    expect(setupPath(setup)).toBe("/dashboard");
  });

  test("does not restart onboarding after all organizations are removed", async () => {
    const setup = await resolveSetup(accountSetup(true, []));
    expect(setupPath(setup)).toBe("/dashboard");
  });

  test("starts a new account at organization creation", async () => {
    const setup = await resolveSetup(accountSetup(false, []));
    expect(setupPath(setup)).toBe("/onboarding/organization");
  });

  test("resumes unfinished first-time setup at project creation", async () => {
    const setup = await resolveSetup(accountSetup(false, [organization]));
    expect(setup).toEqual({ step: "project", organization });
  });
});
