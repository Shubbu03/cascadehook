"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { requireSession } from "@/lib/server/session";
import type { Organization } from "@/features/workspace/types";
import { setupName, type NameActionState } from "./form-state";
import { setupPath, type SetupState } from "./setup-state";
import { getWorkspaceSetup } from "./workspace-setup";

export async function createOrganization(
  _previous: NameActionState,
  form: FormData,
): Promise<NameActionState> {
  const { getToken } = await requireSession();
  const name = setupName(form.get("name"));
  if (!name) {
    return {
      error: "Enter a name with 1–100 characters and no control characters.",
    };
  }

  let setup: SetupState;
  try {
    setup = await getWorkspaceSetup();
  } catch (error) {
    return {
      error: error instanceof ApiError
        ? error.message
        : "Couldn't load setup. Please try again.",
    };
  }
  if (setup.step !== "organization") redirect(setupPath(setup));

  try {
    await apiRequest<Organization>("/v1/organizations", getToken, {
      method: "POST",
      data: { name },
    });
  } catch (error) {
    return {
      error: error instanceof ApiError
        ? error.message
        : "Couldn't create the organization. Please try again.",
    };
  }

  revalidatePath("/onboarding", "layout");
  redirect("/onboarding/project");
}
