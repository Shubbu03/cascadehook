import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { requireSession } from "@/lib/server/session";
import { setupPath, type SetupState } from "./data-access/setup-state";
import { getWorkspaceSetup } from "./data-access/workspace-setup";
import { OnboardingError } from "./onboarding-error";
import { OrganizationStep } from "./organization-step";
import { ProjectStep } from "./project-step";

export async function OnboardingStep({
  step,
}: {
  step: "entry" | "organization" | "project";
}) {
  await requireSession();
  let setup: SetupState;
  try {
    setup = await getWorkspaceSetup();
  } catch (error) {
    return (
      <OnboardingError
        message={error instanceof ApiError ? error.message : "Please try again."}
      />
    );
  }
  if (setup.step === "ready" || setup.step !== step) redirect(setupPath(setup));
  if (setup.step === "organization") return <OrganizationStep />;
  return <ProjectStep organization={setup.organization} />;
}
