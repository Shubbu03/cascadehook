"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { requireSession } from "@/lib/server/session";
import type { Project } from "@/features/workspace/types";
import { setupName, type NameActionState } from "./form-state";
import { setupPath, type SetupState } from "./setup-state";
import { getWorkspaceSetup } from "./workspace-setup";

export async function createProject(
  _previous: NameActionState,
  form: FormData,
): Promise<NameActionState> {
  const { getToken } = await requireSession();
  const name = setupName(form.get("name"));
  if (!name) {
    return {
      error: "Enter a name with 1–100 characters and no control characters.",
      code: "invalid_name",
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
  if (setup.step !== "project") redirect(setupPath(setup));
  if (form.get("organizationId") !== setup.organization.id) {
    return {
      error: "Your organization changed. Refresh this page and try again.",
    };
  }

  let project: Project;
  try {
    project = await apiRequest<Project>(
      "/v1/organizations/" + encodeURIComponent(setup.organization.id) + "/projects",
      getToken,
      { method: "POST", data: { name } },
    );
  } catch (error) {
    return {
      error: error instanceof ApiError
        ? error.message
        : "Couldn't create the project. Please try again.",
      code: error instanceof ApiError ? error.code : undefined,
    };
  }

  revalidatePath("/onboarding", "layout");
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/projects/" + encodeURIComponent(project.id));
}
